const got = require('got');

module.exports = function(lib) {
    let { config, redis_client } = lib;

    let twitch = {};

    twitch.access_token = '';

    function validateToken() {
        console.log('validateToken');
        let token = {};

        redis_client.HGET(
            'twitch_auth',
            'client_credentials_' + config.twitch.client_id
        )
        .then(loaded_token => {
            // no token create one
            if (!loaded_token) {
                throw new Error('No Token Generate');
                return;
            }

            // parse token
            token = JSON.parse(loaded_token);

            // got a token validate it
            return got({
                url: 'https://id.twitch.tv/oauth2/validate',
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token.access_token
                },
                responseType: 'json'
            })
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

            twitch.access_token = token.access_token;
            process.emit('twitch_token', '');
        })
        .catch(err => {
            console.error(err);
            // well thats dumb
            createToken();
        });


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

            return redis_client.HSET(
                'twitch_auth',
                'client_credentials_' + data.client_id,
                JSON.stringify(data)
            );
        })
        .then(r => {
            console.log('Token stored');
            validateToken();
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
