# HubSpot tag for Google Tag Manager Server Side

The HubSpot tag for the server GTM communicates with the HubSpot API.

#### You can use this tag to:

- Track custom behavioral events
- Track ecommerce events
- Create new contacts
- Update existing contacts
- Associate custom objects with contacts
- Generate Visitor Identification Token cookie for the Chat Widget (e.g. identify logged-in users by passing their name and email to HubSpot for chat functionality, or use identified users for targeted CTAs such as displaying pop-ups only for non-logged-in users).
  - The tag will set the `__hs_visitor_id_token` cookie with the token value. You must pass this value in your HubSpot Javascript SDK when loading the chat widget. [Learn more](https://developers.hubspot.com/docs/api-reference/legacy/conversations/visitor-identification/guide) about the Visitor Identification Token.

## How to use HubSpot tag

1. Add [HubSpot tag](https://tagmanager.google.com/gallery/#/owners/stape-io/templates/hubspot-tag) to the server GTM from the template gallery.
2. Add HubSpot API Key.
3. Select event.
4. Add user email and event information.

## Useful Resources

- [Setting up the HubSpot tag in the sGTM](https://stape.io/how-to-connect-website-with-hubspot-using-server-side-tracking/)

## Open Source

HubSpot Tag for GTM Server Side is developed and maintained by [Stape Team](https://stape.io/) under the Apache 2.0 license.

### GTM Gallery Status
🟢 [Listed](https://tagmanager.google.com/gallery/#/owners/stape-io/templates/hubspot-tag)
