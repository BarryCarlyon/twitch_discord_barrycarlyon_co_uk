const path = require('path');

require('dotenv').config();

const mysql = require('mysql');
const mysql_pool = mysql.createPool({
    "host":             process.env.DATABASE_HOST,
    "user":             process.env.DATABASE_USER,
    "password":         process.env.DATABASE_PASSWORD,
    "database":         process.env.DATABASE_DATABASE,
    "connectionLimit":  2,
    "charset":          process.env.DATABASE_CHARSET
});

const { createClient } = require("redis");

const redis_client = createClient();
redis_client.on('error', (err) => {
    console.error('REDIS Error', err);
});
redis_client.connect();

var twitch = require(path.join(__dirname, '..', 'modules', 'twitch'))({ mysql_pool, redis_client });
var eventsub = require(path.join(__dirname, '..', 'modules', 'eventsub'))({ mysql_pool, twitch });
var discord = require(path.join(__dirname, '..', 'modules', 'discord'))({ mysql_pool, twitch });

const subscriber = redis_client.duplicate();
subscriber
    .connect()
    .then(async () => {

        await subscriber.subscribe(
            'twitch_discord:user.authorization.revoke',
            (message) => {
                try {
                    message = JSON.parse(message);
                    processUserDie(message.event.user_id);
                } catch (e) {
                    console.log(e)
                }
            }
        );

        await subscriber.subscribe(
            'twitch_discord:stream.offline',
            (message) => {
                try {
                    message = JSON.parse(message);
                    processStreamEnd(message.event.broadcaster_user_id);
                } catch (e) {
                    console.log(e)
                }
            }
        );

        await subscriber.subscribe(
            'twitch_discord:stream.online',
            (message) => {
                try {
                    message = JSON.parse(message);
                    processStreamUp(message.event.broadcaster_user_id);
                } catch (e) {
                    console.log(e)
                }
            }
        );

        await subscriber.subscribe(
            'twitch_discord:channel.update',
            (message) => {
                try {
                    message = JSON.parse(message);
                    processChannelUpdate(message.event.broadcaster_user_id, message.event);
                } catch (e) {
                    console.log(e)
                }
            }
        );
    });
    // @Todo: if cost 1 kill subs for user?


async function processUserDie(user_id) {
    console.log('Terminating', user_id);
    // delete all data

    // unsubscribe
    let subscriptions = await eventsub.getSubscriptions(r[x].eventsub_id);
    eventsub.userUnsubscribe(subscriptions);

    // force set the channel to Not Live
    mysql_pool.query(
        'UPDATE channels SET channel_live = 0 WHERE twitch_user_id = ?',
        [
            user_id
        ],
        (e,r) => {
            if (e) {
                console.log(e);
                return;
            }
        }
    );
}

function processStreamEnd(broadcaster_user_id) {
    console.log('processStreamDown', broadcaster_user_id);
    mysql_pool.query(
        'INSERT INTO notification_log(twitch_user_id, notification_type, status) VALUES (?,?,?)',
        [
            broadcaster_user_id,
            3,
            1
        ],
        (e,r) => {
            if (e) {
                console.log(e);
                return;
            }

            mysql_pool.query(
                'UPDATE channels SET channel_live = 0 WHERE twitch_user_id = ?',
                [
                    broadcaster_user_id
                ],
                (e,r) => {
                    if (e) {
                        console.log(e);
                        return;
                    }
                    console.log('StreamEnded', broadcaster_user_id, r.changedRows);
                }
            );
        }
    );
}


function processStreamUp(broadcaster_user_id) {
    console.log('processStreamUp', broadcaster_user_id);
    mysql_pool.query(
        'INSERT INTO notification_log(twitch_user_id, notification_type, status) VALUES (?,?,?)',
        [
            broadcaster_user_id,
            2,
            1
        ],
        (e,r) => {
            if (e) {
                console.log(e);
                return;
            }

            var eventsub_notification_id = r.insertId;
            console.log(`Tracking as ${eventsub_notification_id}`);

            mysql_pool.query(''
                + 'SELECT l.discord_guild_id, l.discord_channel_id, l.discord_webhook_url, l.discord_template, '
                + 'c.channel_title, c.channel_game, c.channel_live, '
                + 'c.twitch_login, c.twitch_display_name '
                + 'FROM channels c '
                + 'LEFT JOIN links l ON l.twitch_user_id = c.twitch_user_id '
                + 'WHERE c.twitch_user_id = ? AND channel_live = 0 AND discord_webhook_url IS NOT NULL',
                [
                    broadcaster_user_id
                ],
                (e,r) => {
                    if (e) {
                        console.log(e);
                        return;
                    }

                    if (r.length != 1) {
                        console.log('Already live, or invalid user');

                        mysql_pool.query(
                            'UPDATE notification_log SET status = 2, status_words = ? WHERE id = ?',
                            [
                                'Already Live',
                                eventsub_notification_id
                            ],
                            (e,r) => {
                                if (e) {
                                    console.error('Database Error', e);
                                }
                            }
                        );

                        return;
                    }

                    var message = r[0].discord_template;

                    message = message.replace(/\[link\]/g, 'https://twitch.tv/' + r[0].twitch_login);
                    message = message.replace(/\[display\]/g, r[0].twitch_display_name);
                    message = message.replace(/\[user\]/g, r[0].twitch_login);
                    // these should be last
                    // to stop a title containing [user] from being replaced
                    // for example
                    message = message.replace(/\[game\]/g, r[0].channel_game);
                    // same for [game]
                    message = message.replace(/\[title\]/g, r[0].channel_title);

                    discord.createNotification(
                        r[0].discord_webhook_url,
                        {
                            twitch_user_id:     broadcaster_user_id,
                            discord_guild_id:   r[0].discord_guild_id,
                            discord_channel_id: r[0].discord_channel_id
                        },
                        {
                            content: message,
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
                        5,
                        false
                    )
                    .then(notification_id => {
                        //console.log('woo', broadcaster_user_id);
                        mysql_pool.query(
                            'UPDATE notification_log SET status = ? WHERE id = ?',
                            [
                                1,
                                eventsub_notification_id
                            ],
                            (e,r) => {
                                if (e) {
                                    console.error('Database Error', e);
                                }
                            }
                        );
                    })
                    .catch(err => {
                        console.log('error', broadcaster_user_id);
                        mysql_pool.query(
                            'UPDATE notification_log SET status = ? WHERE id = ?',
                            [
                                2,
                                eventsub_notification_id
                            ],
                            (e,r) => {
                                if (e) {
                                    console.error('Database Error', e);
                                }
                            }
                        );
                        //req.session.error = 'Failed to create test Notification';
                    })
                    .finally(() => {
                        console.log('finally', broadcaster_user_id);
                        // mark live
                        mysql_pool.query(
                            'UPDATE channels SET channel_live = 1 WHERE twitch_user_id = ?',
                            [
                                broadcaster_user_id
                            ],
                            (e,r) => {
                                if (e) {
                                    console.log(e);
                                    return;
                                }
                                console.log('StreamUped', broadcaster_user_id, r.changedRows);
                            }
                        );
                    });
                }
            );
        }
    );
}

function processChannelUpdate(broadcaster_user_id, payload) {
    console.log('processChannelUpdate', broadcaster_user_id);
    mysql_pool.query(
        'INSERT INTO notification_log(twitch_user_id, notification_type, status) VALUES (?,?,?)',
        [
            broadcaster_user_id,
            4,
            1
        ],
        (e,r) => {
            if (e) {
                console.log(e);
                return;
            }

            var eventsub_notification_id = r.insertId;

            mysql_pool.query(
                'UPDATE channels SET twitch_login = ?, twitch_display_name = ?, channel_title = ?, channel_game = ? WHERE twitch_user_id = ?',
                [
                    payload.broadcaster_user_login,
                    payload.broadcaster_user_name,
                    payload.title,
                    payload.category_name,
                    payload.broadcaster_user_id
                ],
                (e,r) => {
                    var state = 1;
                    if (e) {
                        state = 2;
                    }

                    mysql_pool.query(
                        'UPDATE notification_log SET status = ? WHERE id = ?',
                        [
                            state,
                            eventsub_notification_id
                        ],
                        (e,r) => {
                            if (e) {
                                console.error('Database Error', e);
                            }

                            console.log('processChannelUpdate', broadcaster_user_id, 'done');
                        }
                    );
                }
            );
        }
    );
}
