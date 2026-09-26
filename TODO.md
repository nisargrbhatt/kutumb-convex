UX Improvements

- Currently, the forms, custom fields are showing in little difficult to understand.
- Also some places have different UI style where other pages follow different style like list page
  of members is simple but detail page of member is different design. We will need a consistent UI
  with similar UX and vibe.
- We are showing forms directly in places of like profile, which can cause little difficulty for end
  user as they don't know whether to save the info or not, so it is better to show the info section
  UI there and move the form to either modal component or separate profile create/update page. This
  makes the readability moves more where enduser can see info clearly like which are default fields
  and which are custom and what are the values.
- We need to improve the UI of emails which are built using React Email, but our emails are very
  simple so need to make them match the Application style.

MCP Integration

- We need a MCP server setup for our application where end user can connect to any LLM provider with
  the API Token for their organization and get information regarding the community members. Example,
  `Who is John Doe?`, `How many sisters does Jared has?`
- For this integration, we will have a section for AI where enduser can get their API Token and that
  token will have claim for the user id and organization id.
- Better auth has different plugins and system for this kind of feature like Agent-Auth
  (https://better-auth.com/docs/plugins/agent-auth), MCP (https://better-auth.com/docs/plugins/mcp),
  and if any of this doesn't work then we can have simple API-Key based auth for resolving tool call
  result.
