import os
from dotenv import load_dotenv

load_dotenv()

from salesgpt.tools import get_linkedin_post_from_query, post_linkedin_post

def get_utm_builder_link():
    '''
    Takes the utm builder link from the user.
    '''
    link = input("Enter the utm builder link: ").strip()
    return link

def generate_content(query, utm_link):
    '''
    Generate content for a twitter post based on the query
    '''
    tweet = get_linkedin_post_from_query(query)
    return f"{tweet}\n{utm_link}"

def post_content(content):
    '''
    Post content to twitter
    '''
    return post_linkedin_post(content)

def view_mode(utm_link):
    '''
    Generate and display linkedin post content only
    '''
    query = input("Enter a query for tweet generation: ")
    content = generate_content(query, utm_link)
    print("\nGenerated LinkedIn Post:\n", content)

def approve_mode(utm_link):
    '''
    Generate, display, and prompt to post linkedin post
    '''
    query = input("Enter a query for tweet generation: ")
    content = generate_content(query, utm_link)
    print("\nGenerated LinkedIn Post:\n", content)
    choice = input("Post this linkedin post? (y/n): ").strip().lower()
    if choice == 'y':
        post_content(content)
        print("LinkedIn post posted!")
    else:
        print("LinkedIn post not posted.")

def direct_post_mode(utm_link):
    '''
    Enter tweet text and post directly
    '''
    linkedin_post = input("Enter the linkedin post to post: ")
    linkedin_post_with_link = f"{linkedin_post}\n{utm_link}"
    post_content(linkedin_post_with_link)
    print("LinkedIn post posted!")

def main():
    '''
    Main function to select mode
    '''
    utm_link = get_utm_builder_link()
    print("Choose a mode:")
    print("1. Generate and view linkedin post")
    print("2. Generate, view, and approve before posting")
    print("3. Direct post (enter linkedin post and post)")
    mode = input("Enter mode number (1/2/3): ").strip()
    if mode == '1':
        view_mode(utm_link)
    elif mode == '2':
        approve_mode(utm_link)
    elif mode == '3':
        direct_post_mode(utm_link)
    else:
        print("Invalid mode selected.")

if __name__ == "__main__":
    main()