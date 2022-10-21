const express = require('express');

module.exports = function(lib) {
    let { mysql_pool, eventsub, discord } = lib;

    const router = express.Router();

    router.use((req,res,next) => {
        if (!req.session.logged_in) {
            req.session.error = 'Need to be logged in to access Admin';
            res.redirect('/');
            return;
        }

        // get account details
        mysql_pool.query(
            'SELECT * FROM links WHERE twitch_user_id = ?',
            [
                req.session.user.twitch.id
            ],
            async (e,r) => {
                if (e) {
                    req.session.error = 'A database error occured';
                    req.session.logged_in = false;
                    res.redirect('/');
                    return;
                }

                res.locals.links = r[0] ? r[0] : false;

                if (!req.session.checked && res.locals.links) {
                    req.session.checked = true;
                    eventsub.validateAndCreate(req.session.user.twitch.id);
                }

                let topics = await eventsub.getSubscriptions(req.session.user.twitch.id);
                res.locals.eventsub = topics.length;

                mysql_pool.query(
                    'SELECT * FROM channels WHERE twitch_user_id = ?',
                    [
                        req.session.user.twitch.id
                    ],
                    (e,r) => {
                        if (e) {
                            req.session.error = 'A database error occured';
                            req.session.logged_in = false;
                            res.redirect('/');
                            return;
                        }

                        res.locals.channel_data = r[0] ? r[0] : false;

                        next();
                    }
                );

                return;
            }
        );
    });

    router.get('/', (req,res) => {
        let discord_error = false;
        if (req.session.hasOwnProperty('error_discord')) {
            if (req.session.error_discord == 30007) {
                delete req.session.error_discord;

                res.render('admin/discord_toomany_hooks', {
                    application_name: process.env.DISCORD_APPLICATION_NAME
                });
                return;
            }
        }

        mysql_pool.query(
            'SELECT * FROM notification_log WHERE twitch_user_id = ? ORDER BY tos DESC, id DESC LIMIT 0,10',
            [
                req.session.user.twitch.id
            ],
            (e,r) => {
                let events = [];
                if (e) {
                    console.log(e);
                } else {
                    events = r;
                }

                res.render('admin/index', {
                    events
                });
            }
        );
    });

    router.post('/recache/', (req,res) => {
        console.log('Recaching');
        eventsub.preChannel(req.session.user.twitch.id);
        req.session.success = 'Recaching in the background';
        res.redirect('/admin/');
    });

    router.post('/test/:which', async (req,res) => {
        if (!res.locals.links) {
            req.session.error = 'Cannot test a non existant webhook';
            res.redirect('/admin/');
            return;
        }

        let content = 'Hello <@' + res.locals.links.discord_user_id + '> Testing! This message will self destruct!';
        if (req.params.which == 'live') {
            content = res.locals.links.discord_template;
        }

        discord.createNotification(
            res.locals.links.discord_webhook_url,
            {
                twitch_user_id:     req.session.user.twitch.id,
                discord_guild_id:   res.locals.links.discord_guild_id,
                discord_channel_id: res.locals.links.discord_channel_id
            },
            {
                content,
                username: process.env.DISCORD_WEBHOOK_NAME,
                avatar_url: process.env.DISCORD_WEBHOOK_LOGO,
                allowed_mentions: {
                    parse: [
                        "everyone",
                        "roles",
                        "users"
                    ]
                }
            },
            1,
            true
        )
        .then(notification_id => {
            console.log('done', notification_id);
            req.session.success = 'Created (and deleted) Test Notification';
        })
        .catch(err => {
            console.log('err');
            req.session.error = 'Failed to create test Notification';
        })
        .finally(() => {
            //console.log('finally');
            res.redirect('/admin/');
        });
    });

    router.post('/update/', express.urlencoded({extended: true}), (req,res) => {
        let discord_template =  req.body.discord_template;

        if (!discord_template) {
            req.session.error = 'No Template specified';
            res.redirect('/admin/');
            return;
        }

        if (discord_template.length <= 0) {
            req.session.error = 'Difficult to send a notification if the message is blank!';
            res.redirect('/admin/');
            return;
        }

        mysql_pool.query(
            'UPDATE links SET discord_template = ? WHERE twitch_user_id = ?',
            [
                discord_template,
                req.session.user.twitch.id
            ],
            (e,r) => {
                if (e) {
                    console.error('discord_template', e);
                    req.session.error = 'A Database Error occured updating your template';
                } else if (r.affectedRows >= 1) {
                    req.session.success = 'Updated your Go Live Message';
                }

                res.redirect('/admin/');
            }
        );
    });

    return router;
}
