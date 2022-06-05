const got = require('got');

module.exports = function(lib) {
    let { config, redis_client } = lib;

    let twitch = {};

    twitch.access_token = '';

    function validateToken() {
        console.log('validateToken');
        redis_client.hget(
            'twitch_auth',
            'client_credentials_' + config.twitch.client_id,
            (e,r) => {
                if (e) {
                    console.error('Redis Error', e);
                    return;
                }

                if (!r) {
                    createToken();
                    return;
                }

                try {
                    r = JSON.parse(r);
                } catch (e) {
                    createToken();
                    return;
                }

                // validate
                got({
                    url: 'https://id.twitch.tv/oauth2/validate',
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + r.access_token
                    },
                    responseType: 'json'
                })
                .then(resp => {
                    console.log('validate', resp.body);
                    if (!resp.body.expires_in) {
                        createToken();
                        return;
                    }
                    if (resp.body.expires_in < 3600) {
                        createToken();
                        return;
                    }

                    twitch.access_token = r.access_token;
                    process.emit('twitch_token', '');
                })
                .catch(err => {
                    // well thats dumb
                    createToken();
                });
            }
        );
    }
    validateToken();
    setInterval(() => {
        validateToken();
    }, (30 * 60 * 1000));

    function createToken() {
        got({
            url: 'https://id.twitch.tv/oauth2/token',
            method: 'POST',
            searchParams: {
                client_id: config.twitch.client_id,
                client_secret: config.twitch.client_secret,
                grant_type: 'client_credentials'
            },
            responseType: 'json'
        })
        .then(resp => {
            var data = resp.body;
            data.client_id = config.twitch.client_id;

            redis_client.hset(
                'twitch_auth',
                'client_credentials_' + data.client_id,
                JSON.stringify(data),
                (e,r) => {
                    if (e) {
                        console.log('Failed to store token', e);
                    } else {
                        console.log('Token stored', r);

                        validateToken();
                    }
                }
            );
        })
        .catch(err => {
            if (err.response) {
                console.error('Token Generate error', err.response.statusCode, err.response.body);
            } else {
                console.error('Token Generate error', err);
            }
        })
    }

    return twitch;
}
