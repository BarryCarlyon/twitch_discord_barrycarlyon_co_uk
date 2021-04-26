const express = require('express');
const got = require('got');

module.exports = function(lib) {
    let { config, mysql_pool, eventsub } = lib;

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

                res.locals.links = false;
                if (r.length == 1) {
                    res.locals.links = r[0];

                    if (!req.session.checked) {
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
                }

                next();
            }
        );
    });

    router.get('/', (req,res) => {
        mysql_pool.query(
            'SELECT * FROM notification_log WHERE twitch_user_id = ? ORDER BY tos DESC LIMIT 0,10',
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

    router.post('/test/', (req,res) => {
        if (!res.locals.links) {
            req.session.error = 'Cannot test a non existant webhook';
            res.redirect('/admin/');
            return;
        }

        mysql_pool.query(
            'INSERT INTO notification_log(twitch_user_id, discord_type) VALUES (?,?)',
            [
                req.session.user.twitch.id,
                1
            ],
            (e,r) => {
                if (e) {
                    console.log('DB Error');
                    req.session.error = 'A database error occured';
                    req.session.logged_in = false;
                    res.redirect('/');
                    return;
                }

                var notification_id = r.insertId;

                console.log('Testing', res.locals.links.discord_webhook_id);
                got({
                    url: res.locals.links.discord_webhook_url,
                    method: 'POST',
                    searchParams: {
                        wait: true
                    },
                    json: {
                        content: 'Hello <@' + res.locals.links.discord_user_id + '> Testing! This message will self destruct!'
                    },
                    responseType: 'json'
                })
                .then(resp => {
                    console.log('Tested OK', res.locals.links.discord_webhook_id);

                    var discord_message_id = resp.body.id;
                    var discord_message_url = 'https://discord.com/channels/' + res.locals.links.discord_guild_id + '/' + res.locals.links.discord_channel_id + '/' + discord_message_id;

                    mysql_pool.query(
                        'UPDATE notification_log SET discord_message_id = ?, discord_message_url = ?, status = 1 WHERE id = ?',
                        [
                            discord_message_id,
                            discord_message_url,
                            notification_id
                        ],
                        (e,r) => {
                            if (e) {
                                console.log(e);
                                // balls
                                req.session.error = 'A database error occured';
                                req.session.logged_in = false;
                                res.redirect('/');
                                return;
                            } else {
                                req.session.success = 'Test was sent ok';
                                res.redirect('/admin/');
                            }
                        }
                    );

                    setTimeout(() => {
                        // delete it
                        got({
                            url: res.locals.links.discord_webhook_url + '/messages/' + discord_message_id,
                            method: 'DELETE'
                        })
                        .then(resp => {
                            console.log('Deleted OK', resp.statusCode);

                            mysql_pool.query(
                                'UPDATE notification_log SET status = 3 WHERE id = ?',
                                [
                                    notification_id
                                ],
                                (e,r) => {
                                    if (e) {
                                        console.log('DB Error');
                                    }
                                }
                            );
                        })
                        .catch(err => {
                            if (err.response) {
                                console.log('Delete Failed', err.response.statusCode);
                            } else {
                                console.log('Delete Failed', err);
                            }
                        });
                    }, 5000);
                })
                .catch(err => {
                    var words = '';
                    if (err.response) {
                        console.error('Discord Error', err.response.statusCode, err.response.body);
                        // the oAuth dance failed
                        req.session.error = 'An Error occured: ' + ((err.response && err.response.body.message) ? err.response.body.message : 'Unknown');
                        words = err.response.body;
                    } else {
                        req.session.error = 'An Unknown error occured with testing the Webhook',
                        console.log('Error', err);
                        words = 'Bad Error';
                    }

                    mysql_pool.query(
                        'UPDATE notification_log SET status = 2, status_words = ? WHERE id = ?',
                        [
                            notification_id,
                            words
                        ],
                        (e,r) => {
                            if (e) {
                                console.log(e);
                                return;
                            }

                            res.redirect('/admin/');
                        }
                    );
                })
            }
        );
    });

    return router;
}
