import os
from dotenv import load_dotenv

load_dotenv()

from salesgpt.tools import post_twitter_post, generate_twitter_post

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
    tweet = generate_twitter_post(query)
    utm_link = get_utm_builder_link()
    return f"{tweet}\n{utm_link}"

def post_content(content):
    '''
    Post content to twitter
    '''
    return post_twitter_post(content)

def view_mode(utm_link):
    '''
    Generate and display tweet content only
    '''
    query = input("Enter a query for tweet generation: ")
    content = generate_content(query, utm_link)
    print("\nGenerated Tweet:\n", content)

def approve_mode(utm_link):
    '''
    Generate, display, and prompt to post tweet
    '''
    query = input("Enter a query for tweet generation: ")
    content = generate_content(query, utm_link)
    print("\nGenerated Tweet:\n", content)
    choice = input("Post this tweet? (y/n): ").strip().lower()
    if choice == 'y':
        post_content(content)
        print("Tweet posted!")
    else:
        print("Tweet not posted.")

def direct_post_mode(utm_link):
    '''
    Enter tweet text and post directly
    '''
    tweet = input("Enter the tweet to post: ")
    tweet_with_link = f"{tweet}\n{utm_link}"
    post_content(tweet_with_link)
    print("Tweet posted!")

def main():
    '''
    Main function to select mode
    '''
    utm_link = get_utm_builder_link()
    print("Choose a mode:")
    print("1. Generate and view tweet")
    print("2. Generate, view, and approve before posting")
    print("3. Direct post (enter tweet and post)")
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