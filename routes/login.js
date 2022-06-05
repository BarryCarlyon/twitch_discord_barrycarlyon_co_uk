const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args))
const crypto = require('crypto');

module.exports = function(lib) {
    let { config, mysql_pool } = lib;

    const router = express.Router();

    router.get('/twitch/', (req,res) => {
        req.session.logged_in = false;
        req.session.user = {
            twitch_access: false,
            twitch: false
        };

        let { code, error, error_description, scope, state } = req.query;
        if (code) {
            // first validate the state is valid
            state = decodeURIComponent(state);

            //console.log(req.session.state, '!=', state);
            if (req.session.state != state) {
                console.log('state mismatch');
                req.session.error = 'State does not match. Please try again!';
                res.redirect('/');
                return;
            }
            delete req.session.state;

            // oauth exchange

            let oauth_params = [
                [ "client_id",      config.twitch.client_id ],
                [ "client_secret",  config.twitch.client_secret ],
                [ "code",           code ],
                [ "grant_type",     "authorization_code" ],
                [ "redirect_uri",    config.twitch.redirect_uri ],
            ]
            const params = new URLSearchParams(oauth_params);

            fetch(
                "https://id.twitch.tv/oauth2/token",
                {
                    "method": 'POST',
                    "headers": {
                        "Accept": "application/json"
                    },
                    "body": params
                }
            )
            .then(resp => resp.json())
            .then(resp => {
                //console.log(resp);
                req.session.user.twitch_access = resp;

                return fetch(
                    "https://api.twitch.tv/helix/users",
                    {
                        "method": "GET",
                        "headers": {
                            "Accept": "application/json",
                            "Client-ID": config.twitch.client_id,
                            "Authorization": 'Bearer ' + req.session.user.twitch_access.access_token
                        }
                    }
                );
            })
            .then(resp => resp.json())
            .then(resp => {
                //console.log(resp);
                if (resp.hasOwnProperty('data') && resp.data.length == 1) {
                    // we got an id
                    // is it the same ID as the broadcaster
                    // as the broadcaster is not a moderator on their own channel
                    req.session.user.twitch = resp.data[0];
                    req.session.logged_in = true;

                    // need to onboard?
                } else {
                    req.session.error = 'Failed to get your User from Twitch';
                }

                res.redirect('/admin/');
            })
            .catch(err => {
                if (err.response) {
                    console.error('Code exchange Error:', err.response.body);
                    // the oAuth dance failed
                    req.session.error = 'An Error occured: ' + ((err.response && err.response.body.message) ? err.response.body.message : 'Unknown');
                } else {
                    req.session.error = 'Code exchange Bad Error',
                    console.log('Error', err);
                }

                res.redirect('/');
            })
        } else if (error) {
            req.session.error = 'An Error occured: ' + error_description;
            res.redirect('/');
        } else {
            // state and redirect
            req.session.state = crypto.randomBytes(16).toString('base64');

            res.redirect(''
                + 'https://id.twitch.tv/oauth2/authorize'
                + '?client_id=' + config.twitch.client_id
                + '&redirect_uri=' + encodeURIComponent(config.twitch.redirect_uri)
                + '&response_type=code'
                + '&state=' + encodeURIComponent(req.session.state)
            );
        }
    });

    router.get('/discord/', (req,res) => {
        if (!req.session.user) {
            // no user in the session
            res.redirect('/');
            return;
        }

        req.session.user.discord = false;
        req.session.user.discord_user = false;
        //req.session.user.discord_access = false;

        let { code, error, error_description, scope, state } = req.query;
        if (code) {
            // first validate the state is valid
            state = decodeURIComponent(state);

            //console.log(req.session.state, '!=', state);
            if (req.session.state != state) {
                console.log('state mismatch');
                req.session.error = 'State does not match. Please try again!';
                res.redirect('/');
                return;
            }
            delete req.session.state;

            let oauth_params = [
                [ "client_id",      config.discord.client_id ],
                [ "client_secret",  config.discord.client_secret ],
                [ "code",           code ],
                [ "grant_type",     "authorization_code" ],
                [ "redirect_uri",    config.discord.redirect_uri ],
            ]
            const params = new URLSearchParams(oauth_params);

            // oauth exchange
            fetch(
                "https://discord.com/api/oauth2/token",
                {
                    "method": 'POST',
                    "headers": {
                        "Accept": "application/json"
                    },
                    "body": params
                }
            )
            .then(resp => resp.json())
            .then(resp => {
                //console.log(resp);

                if (resp.hasOwnProperty('code')) {
                    throw resp;
                }

                req.session.user.discord = resp;


                // get the user
                return fetch(
                    "https://discord.com/api/users/@me",
                    {
                        "method": "GET",
                        "headers": {
                            "Accept": "application/json",
                            "Authorization": "Bearer " + resp.access_token
                        }
                    }
                );
            })
            .then(resp => resp.json())
            .then(resp => {
                //console.log(resp);
                req.session.user.discord_user = resp;

                if (req.session.user.discord.webhook) {
                    console.log('updating webhook - ' + req.session.user.discord.webhook.id);
                    mysql_pool.query(''
                        + 'INSERT INTO links (twitch_user_id, discord_user_id, discord_guild_id, discord_channel_id, discord_webhook_id, discord_webhook_token, discord_webhook_url) VALUES (?,?,?,?,?,?,?) '
                        + 'ON DUPLICATE KEY UPDATE twitch_user_id = ?, discord_user_id = ?, discord_guild_id = ?, discord_channel_id = ?, discord_webhook_id = ?, discord_webhook_token = ?, discord_webhook_url = ?',
                        [
                            req.session.user.twitch.id,
                            req.session.user.discord_user.id,
                            req.session.user.discord.webhook.guild_id,
                            req.session.user.discord.webhook.channel_id,
                            req.session.user.discord.webhook.id,
                            req.session.user.discord.webhook.token,
                            req.session.user.discord.webhook.url,

                            req.session.user.twitch.id,
                            req.session.user.discord_user.id,
                            req.session.user.discord.webhook.guild_id,
                            req.session.user.discord.webhook.channel_id,
                            req.session.user.discord.webhook.id,
                            req.session.user.discord.webhook.token,
                            req.session.user.discord.webhook.url
                        ],
                        (e,r) => {
                            if (e) {
                                console.log(e);
                                req.session.error = 'A Database Error Occured';
                                req.session.logged_in = false;
                                res.redirect('/');
                                return;
                            }

                            //console.log(r);
                            req.session.success = 'Connected and created a Webhook';
                            res.redirect('/admin/');
                        }
                    );

                    return;
                }

                //console.log(resp);

                req.session.error = 'No Webhook Created by Discord';
                res.redirect('/admin/');
            })
            .catch(err => {
                if (err.code) {
                    req.session.error = 'Discord Error: ' + err.message,
                    req.session.error_discord = err.code;
                } else if (err.response) {
                    console.error('Discord Error', err.response.statusCode, err.response.body);
                    // the oAuth dance failed
                    req.session.error = 'An Error occured: ' + ((err.response && err.response.body.message) ? err.response.body.message : 'Unknown');
                    req.session.error_discord = err.response.body.code;
                } else {
                    req.session.error = 'Code exchange Bad Error',
                    console.log('Error', err);
                }

                res.redirect('/admin/');
            })
        } else if (error) {
            req.session.error = 'An Error occured: ' + error_description;
            res.redirect('/');
        } else {
            // state and redirect
            req.session.state = crypto.randomBytes(16).toString('base64');

            res.redirect(''
                + 'https://discord.com/api/oauth2/authorize'
                + '?client_id=' + config.discord.client_id
                + '&redirect_uri=' + encodeURIComponent(config.discord.redirect_uri)
                + '&response_type=code'
                + '&scope=identify+webhook.incoming'
                + '&state=' + encodeURIComponent(req.session.state)
            );
        }
    });


    return router;
}
