const crypto = require('crypto');

module.exports = function(lib) {
    let { mysql_pool, twitch } = lib;

    let eventsub = {};

    eventsub.validateAndCreate = (twitch_id) => {
        console.log('Running login and eventsub create for', twitch_id);

        eventsub.subscribe('channel.update', twitch_id);
        eventsub.subscribe('stream.online', twitch_id);
        eventsub.subscribe('stream.offline', twitch_id);
    }

    eventsub.subscribe = (type, broadcaster_user_id) => {
        fetch(
            'https://api.twitch.tv/helix/eventsub/subscriptions',
            {
                method: 'POST',
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
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
                        callback: process.env.TWITCH_EVENTSUB_CALLBACK,
                        secret: process.env.TWITCH_EVENTSUB_SECRET
                    }
                })
            }
        )
        .then(resp => resp.json().then(data => ({ status: resp.status, body: data })))
        .then(resp => {
            if (resp.status == 409) {
                // all good
            } else {
                console.log('eventsub subscribe resp', type, broadcaster_user_id, resp.status, resp.body);
            }
        })
        .catch(err => {
            console.error('EventSub Error', type, broadcaster_user_id, err);
        })
        .finally(() => {
            if (type == 'channel.update') {
                eventsub.preChannel(broadcaster_user_id);
            }
            if (type == 'stream.online') {
                eventsub.preStream(broadcaster_user_id);
            }
        });
    }

    eventsub.getSubscriptions = async(user_id) => {
        let eventsub_request = await fetch(
            `https://api.twitch.tv/helix/eventsub/subscriptions?user_id=${user_id}`,
            {
                method: 'GET',
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': 'Bearer ' + twitch.access_token,
                    'Accept': 'application/json'
                }
            }
        );

        if (eventsub_request.status != 200) {
            console.log(`Failed to get subscriptions ${user_id}`);
            return [];
        }

        let eventsub_data = await eventsub_request.json();

        //console.log('got data', eventsub_data);
        return eventsub_data.data;
    }

    eventsub.userUnsubscribe = async (eventsub_data) => {
        eventsub_data.data.forEach(item => {
            let { id, status } = item;
            if (status == 'enabled') {
                eventsub.unsubscribe(id);
            }
        });
    }

    eventsub.unsubscribe = (id) => {
        // delete
        fetch(
            'https://api.twitch.tv/helix/eventsub/subscriptions?id=' + id,
            {
                method: 'DELETE',
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': 'Bearer ' + twitch.access_token
                }
            }
        )
        .then(resp => {
            console.log('Nailed with', resp.status);
        })
        .catch(err => {
            console.error('Failed with', err.response.status);
        });
    }

    eventsub.preChannel = (broadcaster_id) => {
        var user = {};
        fetch(
            'https://api.twitch.tv/helix/users?id=' + broadcaster_id,
            {
                method: 'GET',
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': 'Bearer ' + twitch.access_token,
                    'Accept': 'application/json'
                }
            }
        )
        .then(resp => resp.json().then(data => ({ status: resp.status, body: data })))
        .then(resp => {
            if (resp.body.data && resp.body.data.length == 1) {
                console.log('preChannel got user');
                user = resp.body.data[0];
            }

            return fetch(
                'https://api.twitch.tv/helix/channels?broadcaster_id=' + broadcaster_id,
                {
                    method: 'GET',
                    headers: {
                        'Client-ID': process.env.TWITCH_CLIENT_ID,
                        'Authorization': 'Bearer ' + twitch.access_token,
                        'Accept': 'application/json'
                    }
                }
            );
        })
        .then(resp => resp.json().then(data => ({ status: resp.status, body: data })))
        .then(resp => {
            if (resp.body.data && resp.body.data.length == 1) {
                console.log('preChannel got channel');
                mysql_pool.query(''
                    + 'INSERT INTO channels (twitch_user_id, twitch_login, twitch_display_name, channel_title, channel_game) VALUES (?,?,?,?,?) '
                    + 'ON DUPLICATE KEY UPDATE twitch_login = ?, twitch_display_name = ?, channel_title = ?, channel_game = ?',
                    [
                        broadcaster_id,

                        user.login,
                        user.display_name,
                        resp.body.data[0].title,
                        resp.body.data[0].game_name,

                        user.login,
                        user.display_name,
                        resp.body.data[0].title,
                        resp.body.data[0].game_name
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
                console.log('preChannel Error', err.response.status, err.response.body);
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
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': 'Bearer ' + twitch.access_token,
                    'Accept': 'application/json'
                }
            }
        )
        .then(resp => resp.json().then(data => ({ status: resp.status, body: data })))
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
                console.log('preStream Error', err.response.status, err.response.body);
            } else {
                console.error('preStream Error', err);
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
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': 'Bearer ' + twitch.access_token,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    type: 'user.authorization.revoke',
                    version: 1,
                    condition: {
                        client_id: process.env.TWITCH_CLIENT_ID
                    },
                    transport: {
                        method: 'webhook',
                        callback: process.env.TWITCH_EVENTSUB_CALLBACK,
                        secret: process.env.TWITCH_EVENTSUB_SECRET
                    }
                })
            }
        )
        .then(resp => {
            console.log('eventsub revoke', resp.status);
        })
        .catch(err => {
            if (err.response) {
                console.log('EventSub Error revoke', err.response.status, err.response.body);
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
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': 'Bearer ' + twitch.access_token
                }
            }
        )
        .then(resp => {
            console.log('Nailed with', resp.status);
        })
        .catch(err => {
            console.error('Failed with', err.response.status);
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
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': 'Bearer ' + twitch.access_token,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }
        )
        .then(resp => resp.json().then(data => ({ status: resp.status, body: data })))
        .then(resp => {
            if (resp.body.data.length == 0) {
                console.log('Sub no exist, create');
                eventsub.createRevoke();
                return;
            }

            var found = false;
            for (var x=0;x<resp.body.data.length;x++) {
                if (resp.body.data[x].transport.callback == process.env.TWITCH_EVENTSUB_CALLBACK) {
                    // this this instance
                    if (resp.body.data[x].status == 'enabled') {
                        found = true;
                    } else {
                        console.log('Sub is invalid, delete and create');
                        eventsub.deleteRevoke(resp.body.data[0].id);
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
                console.log('EventSub Init Error', err.response.status, err.response.body);
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
