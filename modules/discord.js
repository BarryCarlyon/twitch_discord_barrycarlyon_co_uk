const got = require('got');

module.exports = function(lib) {
    let { config, mysql_pool } = lib;

    let discord = {};

    discord.createNotification = async (url, data, payload, notification_type, del) => {
        return new Promise((resolve, reject) => {
            mysql_pool.query(
                'INSERT INTO notification_log(twitch_user_id, notification_type) VALUES (?,?)',
                [
                    data.twitch_user_id,
                    notification_type
                ],
                async (e,r) => {
                    if (e) {
                        console.log(e);
                        return reject(e);
                    }

                    var notification_id = r.insertId;

                    got({
                        url,
                        method: 'POST',
                        searchParams: {
                            wait: true
                        },
                        json: payload,
                        responseType: 'json'
                    })
                    .then(resp => {
                        console.log('Discord OK', url);

                        var discord_message_id = resp.body.id;
                        var discord_message_url = 'https://discord.com/channels/'
                            + data.discord_guild_id + '/'
                            + data.discord_channel_id + '/'
                            + discord_message_id;

                        mysql_pool.query(
                            'UPDATE notification_log SET discord_message_id = ?, discord_message_url = ?, status = ? WHERE id = ?',
                            [
                                discord_message_id,
                                discord_message_url,
                                1,
                                notification_id
                            ],
                            async (e,r) => {
                                if (e) {
                                    console.log(e);

                                    return reject(e);
                                } else {
                                    //return notification_id;

                                    // logged OK

                                    // delete?
                                    if (del) {
                                        setTimeout(() => {
                                            // delete it
                                            got({
                                                url: url + '/messages/' + discord_message_id,
                                                method: 'DELETE'
                                            })
                                            .then(resp => {
                                                console.log('Deleted OK', resp.statusCode);

                                                mysql_pool.query(
                                                    'UPDATE notification_log SET status = ? WHERE id = ?',
                                                    [
                                                        3,
                                                        notification_id
                                                    ],
                                                    async (e,r) => {
                                                        if (e) {
                                                            console.log('DB Error');
                                                            return reject(e);
                                                        }

                                                        return resolve(notification_id);
                                                    }
                                                );
                                            })
                                            .catch(err => {
                                                if (err.response) {
                                                    console.log('Delete Failed', err.response.statusCode);
                                                } else {
                                                    console.log('Delete Failed', err);
                                                }

                                                return reject(err);
                                            });
                                        }, 5000);

                                        return;
                                    }

                                    return resolve(notification_id);
                                }
                            }
                        );
                    })
                    .catch(err => {
                        var words = '';
                        if (err.response) {
                            console.error('Discord Error', err.response.statusCode, err.response.body);
                            // the oAuth dance failed
                            words = err.response.body.message;

                            if (err.response.body.code == 10015) {
                                // dead Discord webhook
                                mysql_pool.query(
                                    'UPDATE links SET discord_webhook_id = null, discord_webhook_token = null, discord_webhook_url = null WHERE discord_webhook_url = ?',
                                    [
                                        url
                                    ],
                                    (e,r) => {
                                        if (e) {
                                            console.log(e);
                                        }
                                    }
                                );
                                // _probably_ need to kill the Twitch EventSubs?
                            }
                        } else {
                            console.error('Discord Error', err);
                            words = 'Unknown';
                        }

                        // screw this paticular DB error
                        mysql_pool.query(
                            'UPDATE notification_log SET status = ?, status_words = ? WHERE id = ?',
                            [
                                2,
                                words,
                                notification_id
                            ],
                            (e,r) => {
                                if (e) {
                                    console.log(e);
                                }
                            }
                        );

                        return reject(err);
                    })
                }
            );
        });
    }

    return discord;
}
