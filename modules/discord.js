module.exports = function(lib) {
    let { mysql_pool } = lib;

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

                    fetch(
                        url + '?wait=true',
                        {
                            method: 'POST',
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(payload),
                        }
                    )
                    .then(resp => resp.json().then(data => ({ status: resp.status, body: data })))
                    .then(resp => {
                        console.log('Discord Result', resp.status, resp.body);

                        if (resp.status != 200) {
                            if (resp.body.code == 10015) {
                                // dead Discord webhook
                                mysql_pool.query(
                                    'DELETE FROM links WHERE WHERE discord_webhook_url = ?'
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
                                return reject();
                            }

                            // another problem?
                            mysql_pool.query(
                                'UPDATE notification_log SET status = ?, status_words = ? WHERE id = ?',
                                [
                                    2,
                                    resp.body.message,
                                    notification_id
                                ],
                                (e,r) => {
                                    if (e) {
                                        console.log(e);
                                    }
                                }
                            );

                            return reject();
                        }

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
                                            fetch(
                                                url + '/messages/' + discord_message_id,
                                                {
                                                    method: 'DELETE'
                                                }
                                            )
                                            .then(resp => {
                                                console.log('Deleted OK', resp.status);

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
                                                    console.log('Delete Failed', err.response.status);
                                                } else {
                                                    console.log('Delete Failed', err);
                                                }

                                                return reject(err);
                                            });
                                        }, 10000);

                                        return;
                                    }

                                    return resolve(notification_id);
                                }
                            }
                        );
                    })
                    .catch(err => {
                        console.error('Discord Error', err);

                        // screw this paticular DB error
                        mysql_pool.query(
                            'UPDATE notification_log SET status = ?, status_words = ? WHERE id = ?',
                            [
                                2,
                                'Unknown',
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
