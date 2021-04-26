const fs = require('fs');
const path = require('path');

const got = require('got');

const config = JSON.parse(fs.readFileSync(path.join(
    __dirname,
    '..',
    'config.json'
)));

//config.database.connectionLimit = 1;

const mysql = require('mysql');
const mysql_pool = mysql.createPool(config.database);

const redis = require('redis');
const redis_client = redis.createClient();
redis_client.on('error', (err) => {
    console.error('REDIS Error', err);
});
const redis_subscriber = redis.createClient();
redis_subscriber.on('error', (err) => {
    console.error('REDIS Error', err);
});

var twitch = require(path.join(__dirname, '..', 'modules', 'twitch'))({ config, mysql_pool, redis_client });
var eventsub = require(path.join(__dirname, '..', 'modules', 'eventsub'))({ config, mysql_pool, twitch });

redis_subscriber.on('message', (chan, message) => {
    switch (chan) {
        case 'twitch_discord_user.authorization.revoke':
            try {
                message = JSON.parse(message);
                processUserDie(message.event.user_id);
            } catch (e) {
                console.log(e)
            }
            break;
        case 'twitch_discord_stream.offline':
            try {
                message = JSON.parse(message);
                processStreamEnd(message.event.broadcaster_user_id);
            } catch (e) {
                console.log(e)
            }
            break;
        case 'twitch_discord_stream.online':
            try {
                message = JSON.parse(message);
                processStreamUp(message.event.broadcaster_user_id);
            } catch (e) {
                console.log(e)
            }
            break;
    }
});
redis_subscriber.subscribe('twitch_discord_user.authorization.revoke');
redis_subscriber.subscribe('twitch_discord_stream.offline');
redis_subscriber.subscribe('twitch_discord_stream.online');




function processUserDie(user_id) {
    mysql_pool.query(
        'SELECT eventsub_id FROM eventsub WHERE twitch_user_id = ?',
        [
            user_id
        ],
        (e,r) => {
            if (e) {
                console.log(e);
                return;
            }
            if (r.length == 0) {
                console.log('Nothing to revoke');
                return;
            }
            for (var x=0;x<r.length;x++) {
                console.log('Terminate', user_id, r[x].eventsub_id);
                eventsub.unsubscribe(r[x].eventsub_id);
            }
        }
    );
}

function processStreamEnd(broadcaster_user_id) {
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
            console.log('StreamEnd', r);
        }
    );
}


function processStreamUp(broadcaster_user_id) {
    mysql_pool.query(
        'INSERT INTO notification_log(twitch_user_id, discord_type) VALUES (?,?)',
        [
            broadcaster_user_id,
            1
        ],
        (e,r) => {
            if (e) {
                console.log(e);
                return;
            }

            var notification_id = r.insertId;

            mysql_pool.query(''
                + 'SELECT discord_webhook_url, channel_live '
                + 'FROM channels c '
                + 'LEFT JOIN links l ON l.twitch_user_id = c.twitch_user_id '
                + 'WHERE c.twitch_user_id = ? AND channel_live = 0 AND discord_webhook_url != ?',
                [
                    broadcaster_user_id,
                    ''
                ],
                (e,r) => {
                    if (e) {
                        console.log(e);
                        return;
                    }

                    if (r.length != 1) {
                        console.log('Already live');

                        mysql_pool.query(
                            'UPDATE notification_log SET status = 2, status_words = ? WHERE id = ?',
                            [
                                'Already Live',
                                notification_id
                            ],
                            (e,r) => {
                                if (e) {
                                    console.error('Database Error', e);
                                }
                            }
                        );

                        return;
                    }

                    // notify
                    got({
                        url: r[0].discord_webhook_url,
                        method: 'POST',
                        searchParams: {
                            wait: true
                        },
                        json: {
                            content: 'Now Live!'
                        },
                        responseType: 'json'
                    })
                    .then(resp => {
                        console.log(resp.statusCode);

                        var discord_message_id = resp.body.id;

                        mysql_pool.query(
                            'UPDATE notification_log SET status = 1, discord_message_id = ? WHERE id = ?',
                            [
                                discord_message_id,
                                notification_id
                            ],
                            (e,r) => {
                                if (e) {
                                    console.error('Database Error', e);
                                }
                            }
                        );
                    })
                    .catch(err => {
                        if (err.response) {
                            console.log('Notification Failed', err.response.statusCode);
                        } else {
                            console.log('Notification Failed', err);
                        }
                    })

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
                            console.log('StreamUped', r);
                        }
                    );
                }
            );
        }
    );
}
