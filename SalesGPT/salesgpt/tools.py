import json
import os
import boto3
import requests
from langchain.agents import Tool
from langchain.chains import RetrievalQA
from langchain.text_splitter import CharacterTextSplitter
from langchain_community.chat_models import BedrockChat
from langchain_community.vectorstores import Chroma
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from litellm import completion
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from requests_oauthlib import OAuth1Session

def setup_knowledge_base(
    product_catalog: str = None, model_name: str = "gpt-3.5-turbo"
):
    """
    We assume that the product catalog is simply a text string.
    """
    # load product catalog
    with open(product_catalog, "r") as f:
        product_catalog = f.read()

    text_splitter = CharacterTextSplitter(chunk_size=5000, chunk_overlap=200)
    texts = text_splitter.split_text(product_catalog)

    llm = ChatOpenAI(model_name="gpt-4-0125-preview", temperature=0)

    embeddings = OpenAIEmbeddings()
    docsearch = Chroma.from_texts(
        texts, embeddings, collection_name="product-knowledge-base"
    )

    knowledge_base = RetrievalQA.from_chain_type(
        llm=llm, chain_type="stuff", retriever=docsearch.as_retriever()
    )
    return knowledge_base


def completion_bedrock(model_id, system_prompt, messages, max_tokens=1000):
    """
    High-level API call to generate a message with Anthropic Claude.
    """
    bedrock_runtime = boto3.client(
        service_name="bedrock-runtime", region_name=os.environ.get("AWS_REGION_NAME")
    )

    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": messages,
        }
    )

    response = bedrock_runtime.invoke_model(body=body, modelId=model_id)
    response_body = json.loads(response.get("body").read())

    return response_body


def get_product_id_from_query(query, product_price_id_mapping_path):
    # Load product_price_id_mapping from a JSON file
    with open(product_price_id_mapping_path, "r") as f:
        product_price_id_mapping = json.load(f)

    # Serialize the product_price_id_mapping to a JSON string for inclusion in the prompt
    product_price_id_mapping_json_str = json.dumps(product_price_id_mapping)

    # Dynamically create the enum list from product_price_id_mapping keys
    enum_list = list(product_price_id_mapping.values()) + [
        "No relevant product id found"
    ]
    enum_list_str = json.dumps(enum_list)

    prompt = f"""
    You are an expert data scientist and you are working on a project to recommend products to customers based on their needs.
    Given the following query:
    {query}
    and the following product price id mapping:
    {product_price_id_mapping_json_str}
    return the price id that is most relevant to the query.
    ONLY return the price id, no other text. If no relevant price id is found, return 'No relevant price id found'.
    Your output will follow this schema:
    {{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Price ID Response",
    "type": "object",
    "properties": {{
        "price_id": {{
        "type": "string",
        "enum": {enum_list_str}
        }}
    }},
    "required": ["price_id"]
    }}
    Return a valid directly parsable json, dont return in it within a code snippet or add any kind of explanation!!
    """
    prompt += "{"
    model_name = os.getenv("GPT_MODEL", "gpt-3.5-turbo-1106")

    if "anthropic" in model_name:
        response = completion_bedrock(
            model_id=model_name,
            system_prompt="You are a helpful assistant.",
            messages=[{"content": prompt, "role": "user"}],
            max_tokens=1000,
        )

        product_id = response["content"][0]["text"]

    else:
        response = completion(
            model=model_name,
            messages=[{"content": prompt, "role": "user"}],
            max_tokens=1000,
            temperature=0,
        )
        product_id = response.choices[0].message.content.strip()
    return product_id


def generate_stripe_payment_link(query: str) -> str:
    """Generate a stripe payment link for a customer based on a single query string."""

    # example testing payment gateway url
    PAYMENT_GATEWAY_URL = os.getenv(
        "PAYMENT_GATEWAY_URL", "https://agent-payments-gateway.vercel.app/payment"
    )
    PRODUCT_PRICE_MAPPING = os.getenv(
        "PRODUCT_PRICE_MAPPING", "example_product_price_id_mapping.json"
    )

    # use LLM to get the price_id from query
    price_id = get_product_id_from_query(query, PRODUCT_PRICE_MAPPING)
    price_id = json.loads(price_id)
    payload = json.dumps(
        {"prompt": query, **price_id, "stripe_key": os.getenv("STRIPE_API_KEY")}
    )
    headers = {
        "Content-Type": "application/json",
    }

    response = requests.request(
        "POST", PAYMENT_GATEWAY_URL, headers=headers, data=payload
    )
    return response.text

def get_mail_body_subject_from_query(query):
    prompt = f"""
    Given the query: "{query}", analyze the content and extract the necessary information to send an email. The information needed includes the recipient's email address, the subject of the email, and the body content of the email. 
    Based on the analysis, return a dictionary in Python format where the keys are 'recipient', 'subject', and 'body', and the values are the corresponding pieces of information extracted from the query. 
    For example, if the query was about sending an email to notify someone of an upcoming event, the output should look like this:
    {{
        "recipient": "example@example.com",
        "subject": "Upcoming Event Notification",
        "body": "Dear [Name], we would like to remind you of the upcoming event happening next week. We look forward to seeing you there."
    }}
    Now, based on the provided query, return the structured information as described.
    Return a valid directly parsable json, dont return in it within a code snippet or add any kind of explanation!!
    """
    model_name = os.getenv("GPT_MODEL", "gpt-3.5-turbo-1106")

    if "anthropic" in model_name:
        response = completion_bedrock(
            model_id=model_name,
            system_prompt="You are a helpful assistant.",
            messages=[{"content": prompt, "role": "user"}],
            max_tokens=1000,
        )

        mail_body_subject = response["content"][0]["text"]

    else:
        response = completion(
            model=model_name,
            messages=[{"content": prompt, "role": "user"}],
            max_tokens=1000,
            temperature=0.2,
        )
        mail_body_subject = response.choices[0].message.content.strip()
    print(mail_body_subject)
    return mail_body_subject

def send_email_with_gmail(email_details):
    '''.env should include GMAIL_MAIL and GMAIL_APP_PASSWORD to work correctly'''
    try:
        sender_email = os.getenv("GMAIL_MAIL")
        app_password = os.getenv("GMAIL_APP_PASSWORD")
        recipient_email = email_details["recipient"]
        subject = email_details["subject"]
        body = email_details["body"]
        # Create MIME message
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = recipient_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))

        # Create server object with SSL option
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(sender_email, app_password)
        text = msg.as_string()
        server.sendmail(sender_email, recipient_email, text)
        server.quit()
        return "Email sent successfully."
    except Exception as e:
        return f"Email was not sent successfully, error: {e}"

def send_email_tool(query):
    '''Sends an email based on the single query string'''
    email_details = get_mail_body_subject_from_query(query)
    if isinstance(email_details, str):
        email_details = json.loads(email_details)  # Ensure it's a dictionary
    print("EMAIL DETAILS")
    print(email_details)
    result = send_email_with_gmail(email_details)
    return result


def generate_calendly_invitation_link(query):
    '''Generate a calendly invitation link based on the single query string'''
    event_type_uuid = os.getenv("CALENDLY_EVENT_UUID")
    api_key = os.getenv('CALENDLY_API_KEY')
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    url = 'https://api.calendly.com/scheduling_links'
    payload = {
    "max_event_count": 1,
    "owner": f"https://api.calendly.com/event_types/{event_type_uuid}",
    "owner_type": "EventType"
    }
    
    
    response = requests.post(url, json=payload, headers=headers)
    if response.status_code == 201:
        data = response.json()
        return f"url: {data['resource']['booking_url']}"
    else:
        return "Failed to create Calendly link: "

def get_twitter_content_from_query(query):
    '''Get the twitter content and hashtags from the query'''
    prompt = f"""
    Given the query: "{query}", analyze the content and extract the necessary information to generate a twitter post.
    The information needed includes the content of the twitter post and the hashtags.
    Return a dictionary in Python format where the keys are 'content' and 'hashtags', and the values are the corresponding pieces of information extracted from the query.
    For example, if the query was about a new product launch, the output should look like this:
    {{
        "content": "We are excited to announce the launch of our new product!",
        "hashtags": ["#NewProductLaunch", "#ProductLaunch", "#NewProduct"]
    }}
    Now, based on the provided query, return the structured information as described. For all the hashtags, make sure to include the # symbol in the beginning for example: #word.
    Return a valid directly parsable json, dont return in it within a code snippet or add any kind of explanation!!
    """
    model_name = os.getenv("GPT_MODEL", "gpt-3.5-turbo-1106")
    if "anthropic" in model_name:
        response = completion_bedrock(
            model_id=model_name,
            system_prompt="You are a helpful assistant.",
            messages=[{"content": prompt, "role": "user"}],
            max_tokens=1000,
        )
        twitter_content = response["content"][0]["text"]
    else:
        response = completion(
            model=model_name,
            messages=[{"content": prompt, "role": "user"}],
            max_tokens=1000,
            temperature=0.2,
        )
        twitter_content = response.choices[0].message.content.strip()

    return twitter_content


def post_twitter_post(content_with_hashtags):
    '''Post a twitter post based on the single query string using OAuth1Session'''
    consumer_key = os.getenv("TWITTER_API_KEY")
    consumer_secret = os.getenv("TWITTER_API_KEY_SECRET")

    # Be sure to add replace the text of the with the text you wish to Tweet. You can also add parameters to post polls, quote Tweets, Tweet with reply settings, and Tweet to Super Followers in addition to other features.
    payload = {"text": content_with_hashtags}

    # Get request token
    request_token_url = "https://api.twitter.com/oauth/request_token?oauth_callback=oob&x_auth_access_type=write"
    oauth = OAuth1Session(consumer_key, client_secret=consumer_secret)

    try:
        fetch_response = oauth.fetch_request_token(request_token_url)
    except ValueError:
        print(
            "There may have been an issue with the consumer_key or consumer_secret you entered."
        )

    resource_owner_key = fetch_response.get("oauth_token")
    resource_owner_secret = fetch_response.get("oauth_token_secret")
    print("Got OAuth token: %s" % resource_owner_key)

    # Get authorization
    base_authorization_url = "https://api.twitter.com/oauth/authorize"
    authorization_url = oauth.authorization_url(base_authorization_url)
    print("Please go here and authorize: %s" % authorization_url)
    verifier = input("Paste the PIN here: ")

    # Get the access token
    access_token_url = "https://api.twitter.com/oauth/access_token"
    oauth = OAuth1Session(
        consumer_key,
        client_secret=consumer_secret,
        resource_owner_key=resource_owner_key,
        resource_owner_secret=resource_owner_secret,
        verifier=verifier,
    )
    oauth_tokens = oauth.fetch_access_token(access_token_url)

    access_token = oauth_tokens["oauth_token"]
    access_token_secret = oauth_tokens["oauth_token_secret"]

    # Make the request
    oauth = OAuth1Session(
        consumer_key,
        client_secret=consumer_secret,
        resource_owner_key=access_token,
        resource_owner_secret=access_token_secret,
    )

    # Making the request
    response = oauth.post(
        "https://api.twitter.com/2/tweets",
        json=payload,
    )

    if response.status_code != 201:
        raise Exception(
            "Request returned an error: {} {}".format(response.status_code, response.text)
        )

    print("Response code: {}".format(response.status_code))

    # Saving the response as JSON
    json_response = response.json()
    print(json.dumps(json_response, indent=4, sort_keys=True))


def generate_twitter_post(query):
    '''Generate and return formatted twitter content with hashtags based on the query'''
    try:
        # Get the content and hashtags from the query
        twitter_content = get_twitter_content_from_query(query)
        if isinstance(twitter_content, str):
            twitter_content = json.loads(twitter_content)
        
        # Format the content with hashtags
        content = twitter_content.get("content", "")
        hashtags = twitter_content.get("hashtags", [])
        
        # Combine content and hashtags
        if hashtags:
            hashtags_str = " ".join(hashtags)
            formatted_post = f"{content} {hashtags_str}"
        else:
            formatted_post = content
            
        return formatted_post
        
    except Exception as e:
        return f"Failed to generate twitter post: {e}"

def get_linkedin_post_from_query(query):
    '''Get a linkedin post based on the query'''
    prompt = f"""
    Given the query: "{query}", generate a professional LinkedIn post.
    
    Write a well-crafted, engaging LinkedIn post that is professional, authentic, and suitable for LinkedIn's audience.
    The post should be written as natural paragraphs.
    Do not include hashtags.
    Return ONLY the text content of the LinkedIn post, nothing else.
    """
    model_name = os.getenv("GPT_MODEL", "gpt-3.5-turbo-1106")
    
    if "anthropic" in model_name:
        response = completion_bedrock(
            model_id=model_name,
            system_prompt="You are a helpful assistant.",
            messages=[{"content": prompt, "role": "user"}],
            max_tokens=1000,
        )   
        linkedin_post = response["content"][0]["text"]
    else:
        response = completion(
            model=model_name,
            messages=[{"content": prompt, "role": "user"}],
            max_tokens=1000,
        )
        linkedin_post = response.choices[0].message.content.strip()
    
    return linkedin_post
    
def post_linkedin_post(query):
    '''Post a linkedin post based on the single query string using OAuth 2.0'''
    client_id = os.getenv("LINKEDIN_CLIENT_ID")
    client_secret = os.getenv("LINKEDIN_CLIENT_SECRET")
    redirect_uri = os.getenv("LINKEDIN_REDIRECT_URI", "https://oauth.pstmn.io/v1/callback")
    
    if not client_id or not client_secret:
        return "LinkedIn credentials not configured. Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET environment variables."
    
    # Get LinkedIn post content
    linkedin_content = get_linkedin_post_from_query(query)
    print(f"Generated LinkedIn content: {linkedin_content}")
    
    try:
        # Step 1: Get authorization URL
        auth_url = (
            f"https://www.linkedin.com/oauth/v2/authorization?"
            f"response_type=code&"
            f"client_id={client_id}&"
            f"redirect_uri={redirect_uri}&"
            f"state=linkedin_post_state&"
            f"scope=w_member_social"
        )
        
        print(f"Please go here and authorize: {auth_url}")
        auth_code = input("Paste the authorization code here: ")
        
        # Step 2: Exchange authorization code for access token
        token_url = "https://www.linkedin.com/oauth/v2/accessToken"
        token_data = {
            'grant_type': 'authorization_code',
            'code': auth_code,
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri
        }
        
        token_response = requests.post(token_url, data=token_data)
        
        if token_response.status_code != 200:
            return f"Failed to get access token: {token_response.text}"
        
        token_json = token_response.json()
        access_token = token_json.get('access_token')
        
        if not access_token:
            return "Failed to retrieve access token from LinkedIn"
        
        # Step 3: Get user profile to get person URN
        profile_url = "https://api.linkedin.com/v2/me"
        profile_headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        profile_response = requests.get(profile_url, headers=profile_headers)
        
        if profile_response.status_code != 200:
            return f"Failed to get user profile: {profile_response.text}"
        
        profile_data = profile_response.json()
        person_id = profile_data.get('id')
        
        if not person_id:
            return "Failed to get user ID from LinkedIn profile"
        
        # Step 4: Create LinkedIn post
        post_url = "https://api.linkedin.com/v2/ugcPosts"
        
        post_payload = {
            "author": f"urn:li:person:{person_id}",
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {
                        "text": linkedin_content
                    },
                    "shareMediaCategory": "NONE"
                }
            },
            "visibility": {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
            }
        }
        
        post_headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
        }
        
        # Make the post request
        response = requests.post(post_url, json=post_payload, headers=post_headers)
        
        if response.status_code == 201:
            response_data = response.json()
            post_id = response_data.get('id', 'Unknown')
            return f"LinkedIn post posted successfully! Post ID: {post_id}"
        else:
            return f"Failed to post LinkedIn post. Status: {response.status_code}, Response: {response.text}"
            
    except Exception as e:
        return f"Error posting LinkedIn post: {str(e)}"

def get_tools(product_catalog):
    # query to get_tools can be used to be embedded and relevant tools found
    # see here: https://langchain-langchain.vercel.app/docs/use_cases/agents/custom_agent_with_plugin_retrieval#tool-retriever

    # we only use four tools for now, but this is highly extensible!
    knowledge_base = setup_knowledge_base(product_catalog)
    tools = [
        Tool(
            name="ProductSearch",
            func=knowledge_base.run,
            description="useful for when you need to answer questions about product information or services offered, availability and their costs.",
        ),
        Tool(
            name="GeneratePaymentLink",
            func=generate_stripe_payment_link,
            description="useful to close a transaction with a customer. You need to include product name and quantity and customer name in the query input.",
        ),
        Tool(
            name="SendEmail",
            func=send_email_tool,
            description="Sends an email based on the query input. The query should specify the recipient, subject, and body of the email.",
        ),
        Tool(
            name="SendCalendlyInvitation",
            func=generate_calendly_invitation_link,
            description='''Useful for when you need to create invite for a personal meeting in Sleep Heaven shop. 
            Sends a calendly invitation based on the query input.''',
        ),
        Tool(
            name="GenerateTwitterPost",
            func=generate_twitter_post, 
            description='''Useful for when you need to generate a twitter post based on the query input. 
            Generates a twitter post and the hashtags based on the query input.''',
        ),
        Tool(
            name="PostTwitterPost",
            func=post_twitter_post,
            description='''Useful for when you need to post a twitter post based on the query input. 
            Posts a twitter post based on the query input.''',
        ),
        Tool(
            name="GenerateLinkedInPost",
            func=get_linkedin_post_from_query,
            description='''Useful for when you need to generate a LinkedIn post based on the query input. 
            Generates professional LinkedIn content based on the query input.''',
        ),
        Tool(
            name="PostLinkedInPost",
            func=post_linkedin_post,
            description='''Useful for when you need to post a linkedin post based on the query input. 
            Posts a linkedin post based on the query input.''',
        )
    ]

    return tools
