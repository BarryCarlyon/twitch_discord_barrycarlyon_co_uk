const express = require('express');
const got = require('got');

module.exports = function(lib) {
    let { config, mysql_pool, eventsub, discord } = lib;

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
            (e,r) => {
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

                mysql_pool.query(
                    'SELECT topic FROM eventsub WHERE twitch_user_id = ?',
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

                        res.locals.eventsub = r.length;

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
                    }
                );
                return;

                next();
            }
        );
    });

    router.get('/', (req,res) => {
        var discord_error = false;
        if (req.session.hasOwnProperty('error_discord')) {
            if (req.session.error_discord == 30007) {
                delete req.session.error_discord;

                res.render('admin/discord_toomany_hooks', {
                    application_name: config.discord.application_name
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
                var events = [];
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

    router.post('/test/', async (req,res) => {
        if (!res.locals.links) {
            req.session.error = 'Cannot test a non existant webhook';
            res.redirect('/admin/');
            return;
        }
        discord.createNotification(
            res.locals.links.discord_webhook_url,
            {
                twitch_user_id:     req.session.user.twitch.id,
                discord_guild_id:   res.locals.links.discord_guild_id,
                discord_channel_id: res.locals.links.discord_channel_id
            },
            {
                content: 'Hello <@' + res.locals.links.discord_user_id + '> Testing! This message will self destruct!'
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
            console.log('finally');
            res.redirect('/admin/');
        });
    });

    return router;
}
