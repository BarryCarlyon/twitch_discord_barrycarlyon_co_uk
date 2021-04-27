# What is this

This repo contains the code for [https://twitch.discord.barrycarlyon.co.uk](https://twitch.discord.barrycarlyon.co.uk), a Twitch Go Live Notification System for Discord

## Languages

It's written in NodeJS

## Documentation

It uses the following API reference documentation

- [Twitch OAuth authorization code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth#oauth-authorization-code-flow) for Authentication
- [Twitch Eventsub](https://dev.twitch.tv/docs/eventsub) for Channel/Stream Notifications
- [Discord oAuth2](https://discord.com/developers/docs/topics/oauth2) for Discord webhook Setup and Login
- [Discord Webhooks](https://discord.com/developers/docs/resources/webhook) for talking to Webhooks

## What does it look like?

![Example Discord Notification](public/example.png)

## Running it yourself

This system uses MySQL as a Database backend and Redis for session handling and message brokering between the two services

- Import `sql/barrys_discord_twitch.sql`

- Copy `config_sample.json` to `config.json`
- Revise the settings within, for your Discord Application and Twitch Applications.
- Revise that database access settings
- Make sure to update the URLs, and Twitch EventSub
- npm install

It's expected to your [PM2](https://pm2.keymetrics.io/) as a process manager. So you can either use PM2 or run the two jobs another way

- pm2 start app.json

or start the two jobs manually

- node server.js
- node utils/runner.js

## OMGLIEKWUT OHMYGOODNESS U SO MUCH HELP

Thank you for the help I want to give you beer/coffee money -> Check the Funding/Sponsor details
