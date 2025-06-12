import os
from dotenv import load_dotenv

load_dotenv()

from salesgpt.tools import post_twitter_post, generate_twitter_post

def generate_content(query):
    '''
    Generate content for a twitter post based on the query
    '''
    return generate_twitter_post(query)

def post_content(content):
    '''
    Post content to twitter
    '''
    return post_twitter_post(content)

def view_mode():
    '''
    Generate and display tweet content only
    '''
    query = input("Enter a query for tweet generation: ")
    content = generate_content(query)
    print("\nGenerated Tweet:\n", content)

def approve_mode():
    '''
    Generate, display, and prompt to post tweet
    '''
    query = input("Enter a query for tweet generation: ")
    content = generate_content(query)
    print("\nGenerated Tweet:\n", content)
    choice = input("Post this tweet? (y/n): ").strip().lower()
    if choice == 'y':
        post_content(content)
        print("Tweet posted!")
    else:
        print("Tweet not posted.")

def direct_post_mode():
    '''
    Enter tweet text and post directly
    '''
    tweet = input("Enter the tweet to post: ")
    post_content(tweet)
    print("Tweet posted!")

def main():
    '''
    Main function to select mode
    '''
    print("Choose a mode:")
    print("1. Generate and view tweet")
    print("2. Generate, view, and approve before posting")
    print("3. Direct post (enter tweet and post)")
    mode = input("Enter mode number (1/2/3): ").strip()
    if mode == '1':
        view_mode()
    elif mode == '2':
        approve_mode()
    elif mode == '3':
        direct_post_mode()
    else:
        print("Invalid mode selected.")

if __name__ == "__main__":
    main()