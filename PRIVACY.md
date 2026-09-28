# Privacy

ChatGPT Status Dot saves your chosen colors and on/off preference in your browser. It doesn't collect conversations, account details, or usage analytics.

To show the dot, it checks the chat's visible controls and updates the tab icon. Activity and unread state are kept in memory and reset when the page reloads.

The extension may download ChatGPT's public favicon from `chatgpt.com`, `chat.openai.com`, or `cdn.oaistatic.com`. These image requests contain no cookies or referrer. As with any web request, the image server can see your IP address.

## Permissions

| Permission | Why it's needed |
| --- | --- |
| Storage | Remember your colors and on/off preference |
| Scripting | Start the indicator in ChatGPT tabs that are already open |
| ChatGPT website access | Read the controls that show whether a response is running |
| `cdn.oaistatic.com` access | Load the public tab icon when needed |
