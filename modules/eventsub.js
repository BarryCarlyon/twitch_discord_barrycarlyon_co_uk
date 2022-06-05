const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args))
const crypto = require('crypto');

module.exports = function(lib) {
    let { config, mysql_pool, twitch } = lib;

    let eventsub = {};

    eventsub.validateAndCreate = (twitch_id) => {
        console.log('Running validate and create for', twitch_id);

        mysql_pool.query(
            'SELECT * FROM eventsub WHERE twitch_user_id = ?',
            [
                twitch_id
            ],
            (e,r) => {
                if (e) {
                    console.error(e);
                    return;
                }

                var hooks = {
                    'channel.update': false,
                    'stream.online': false,
                    'stream.offline': false
                }

                for (var x=0;x<r.length;x++) {
                    let { topic, eventsub_id } = r[x];
                    hooks[topic] = eventsub_id;
                }

                for (var topic in hooks) {
                    if (!hooks[topic]) {
                        eventsub.subscribe(topic, twitch_id);
                    }
                }
            }
        );
    }

    eventsub.subscribe = (type, broadcaster_user_id) => {
        fetch(
            'https://api.twitch.tv/helix/eventsub/subscriptions',
            {
                method: 'POST',
                headers: {
                    'Client-ID': config.twitch.client_id,
                    'Authorization': 'Bearer ' + twitch.access_token,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    type,
                    version: 1,
                    condition: { broadcaster_user_id },
                    transport: {
                        method: 'webhook',
                        callback: config.twitch.eventsub.callback,
                        secret: config.twitch.eventsub.secret
                    }
                })
            }
        )
        .then(resp => resp.json())
        .then(resp => {
            console.log('eventsub', type, broadcaster_user_id, resp.statusCode, resp);

            // DB it
            mysql_pool.query(''
                + 'INSERT INTO eventsub (twitch_user_id, topic, eventsub_id) VALUES (?,?,?) '
                + 'ON DUPLICATE KEY UPDATE eventsub_id = ?',
                [
                    broadcaster_user_id,
                    type,
                    resp.data[0].id,
                    resp.data[0].id
                ],
                (e,r) => {
                    if (e) {
                        console.log('DB Store Error', e);
                    }
                }
            );

            if (type == 'channel.update') {
                eventsub.preChannel(broadcaster_user_id);
            }
            if (type == 'stream.online') {
                eventsub.preStream(broadcaster_user_id);
            }
        })
        .catch(err => {
            if (err.response) {
                console.log('EventSub Error', type, broadcaster_user_id, err.response.statusCode, err.response.body);
            } else {
                console.error('EventSub Error', type, broadcaster_user_id, err);
            }
        })
    }
    eventsub.unsubscribe = (id) => {
        // delete
        fetch(
            'https://api.twitch.tv/helix/eventsub/subscriptions?id=' + id,
            {
                method: 'DELETE',
                headers: {
                    'Client-ID': config.twitch.client_id,
                    'Authorization': 'Bearer ' + twitch.access_token
                }
            }
        )
        .then(resp => {
            console.log('Nailed with', resp.statusCode);
        })
        .catch(err => {
            console.error('Failed with', err.response.statusCode);
        })
        .finally(() => {
            console.log('Delete cache', id);
            mysql_pool.query(
                'DELETE FROM eventsub WHERE eventsub_id = ?',
                [
                    id
                ],
                (e,r) => {
                    if (e) {
                        console.log('Delete', e);
                    } else {
                        console.log('Delete', r);
                    }
                }
            );
        });
    }

    eventsub.preChannel = (broadcaster_id) => {
        var user = {};
        fetch(
            'https://api.twitch.tv/helix/users?id=' + broadcaster_id,
            {
                method: 'GET',
                headers: {
                    'Client-ID': config.twitch.client_id,
                    'Authorization': 'Bearer ' + twitch.access_token,
                    'Accept': 'application/json'
                }
            }
        )
        .then(resp => resp.json())
        .then(resp => {
            if (resp.data && resp.data.length == 1) {
                console.log('preChannel got user');
                user = resp.data[0];
            }

            return fetch(
                'https://api.twitch.tv/helix/channels?broadcaster_id=' + broadcaster_id,
                {
                    method: 'GET',
                    headers: {
                        'Client-ID': config.twitch.client_id,
                        'Authorization': 'Bearer ' + twitch.access_token,
                        'Accept': 'application/json'
                    }
                }
            );
        })
        .then(resp => resp.json())
        .then(resp => {
            if (resp.data && resp.data.length == 1) {
                console.log('preChannel got channel');
                mysql_pool.query(''
                    + 'INSERT INTO channels (twitch_user_id, twitch_login, twitch_display_name, channel_title, channel_game) VALUES (?,?,?,?,?) '
                    + 'ON DUPLICATE KEY UPDATE twitch_login = ?, twitch_display_name = ?, channel_title = ?, channel_game = ?',
                    [
                        broadcaster_id,

                        user.login,
                        user.display_name,
                        resp.data[0].title,
                        resp.data[0].game_name,

                        user.login,
                        user.display_name,
                        resp.data[0].title,
                        resp.data[0].game_name
                    ],
                    (e,r) => {
                        if (e) {
                            console.error(e);
                        }
                    }
                );
            }
        })
        .catch(err => {
            if (err.response) {
                console.log('preChannel Error', err.response.statusCode, err.response.body);
            } else {
                console.error('preChannel Error', err);
            }
        });
    }
    eventsub.preStream = (user_id) => {
        fetch(
            'https://api.twitch.tv/helix/streams?user_id=' + user_id,
            {
                method: 'GET',
                headers: {
                    'Client-ID': config.twitch.client_id,
                    'Authorization': 'Bearer ' + twitch.access_token,
                    'Accept': 'application/json'
                }
            }
        )
        .then(resp => resp.json())
        .then(resp => {
            var live = 0;
            if (resp.body.data && resp.body.data.length == 1) {
                live = 1;
            }

            mysql_pool.query(''
                + 'INSERT INTO channels (twitch_user_id, channel_live) VALUES (?,?) '
                + 'ON DUPLICATE KEY UPDATE channel_live = ?',
                [
                    user_id,
                    live,
                    live
                ],
                (e,r) => {
                    if (e) {
                        console.error(e);
                    }
                }
            );
        })
        .catch(err => {
            if (err.response) {
                console.log('preChannel Error revoke', err.response.statusCode, err.response.body);
            } else {
                console.error('preChannel Error revoke', err);
            }
        });
    }

    eventsub.check = (eventsub_id) => {
    }

    eventsub.createRevoke = () => {
        return fetch(
            'https://api.twitch.tv/helix/eventsub/subscriptions',
            {
                method: 'POST',
                headers: {
                    'Client-ID': config.twitch.client_id,
                    'Authorization': 'Bearer ' + twitch.access_token,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    type: 'user.authorization.revoke',
                    version: 1,
                    condition: {
                        client_id: config.twitch.client_id
                    },
                    transport: {
                        method: 'webhook',
                        callback: config.twitch.eventsub.callback,
                        secret: config.twitch.eventsub.secret
                    }
                })
            }
        )
        .then(resp => {
            console.log('eventsub revoke', resp.statusCode);
        })
        .catch(err => {
            if (err.response) {
                console.log('EventSub Error revoke', err.response.statusCode, err.response.body);
            } else {
                console.error('EventSub Error revoke', err);
            }
        })
    }
    eventsub.deleteRevoke = (id) => {
        // delete
        fetch(
            'https://api.twitch.tv/helix/eventsub/subscriptions?id=' + id,
            {
                method: 'DELETE',
                headers: {
                    'Client-ID': config.twitch.client_id,
                    'Authorization': 'Bearer ' + twitch.access_token
                }
            }
        )
        .then(resp => {
            console.log('Nailed with', resp.statusCode);
        })
        .catch(err => {
            console.error('Failed with', err.response.statusCode);
        })
        .finally(() => {
            // remake
            eventsub.createRevoke();
        });
    }

    eventsub.init = () => {
        fetch(
            'https://api.twitch.tv/helix/eventsub/subscriptions?type=user.authorization.revoke',
            {
                method: 'GET',
                headers: {
                    'Client-ID': config.twitch.client_id,
                    'Authorization': 'Bearer ' + twitch.access_token,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }
        )
        .then(resp => resp.json())
        .then(resp => {
            if (resp.data.length == 0) {
                console.log('Sub no exist, create');
                eventsub.createRevoke();
                return;
            }

            var found = false;
            for (var x=0;x<resp.data.length;x++) {
                if (resp.data[x].transport.callback == config.twitch.eventsub.callback) {
                    // this this instance
                    if (resp.data[x].status == 'enabled') {
                        found = true;
                    } else {
                        console.log('Sub is invalid, delete and create');
                        eventsub.deleteRevoke(resp.data[0].id);
                        return;
                    }
                }
            }
            if (!found) {
                // (re)create the Revoker
                eventsub.createRevoke();
            }
        })
        .catch(err => {
            if (err.response) {
                console.log('EventSub Init Error', err.response.statusCode, err.response.body);
            } else {
                console.error('EventSub Init Error', err);
            }
        })
    }
    process.on('twitch_token', () => {
        console.log('Token ready running init')
        eventsub.init();
    });

    return eventsub;
}
