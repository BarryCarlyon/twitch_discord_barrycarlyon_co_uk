const path = require('path');

const express = require('express');

const crypto = require('crypto');

require('dotenv').config()

/*
Server
*/
const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.locals.basedir = path.join(__dirname, 'views');

app.set('view options', {
   debug: false,
   compileDebug: false
})

app.use('/', express.static(path.join(__dirname, 'public')));

/* interfaces */
const http = require('http').Server(app);
http.listen(process.env.SERVER_LISTEN, () => {
    console.log('Server raised on', process.env.SERVER_LISTEN);
});

const mysql = require('mysql');
const mysql_pool = mysql.createPool({
    "host":             process.env.DATABASE_HOST,
    "user":             process.env.DATABASE_USER,
    "password":         process.env.DATABASE_PASSWORD,
    "database":         process.env.DATABASE_DATABASE,
    "connectionLimit":  process.env.DATABASE_CONNECTIONLIMIT,
    "charset":          process.env.DATABASE_CHARSET
});

const { createClient } = require("redis");

const redis_client = createClient();
redis_client.on('error', (err) => {
    console.error('REDIS Error', err);
});
redis_client.connect();

/*
Generate a random string at start up
To secure sessions with
This means when the server restarts, it'll generate a new string
And log everyone out
*/
var secret = crypto.randomBytes(64).toString('hex');

/* Session */
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
// Usually you'll put the node process
// behind a proxy such as nginx
// so that proxy will handle the SSL Certs
// trust proxy will tell the session handler to trust the SSL ness of the cookie
// see also https://expressjs.com/en/guide/behind-proxies.html
// for other options you may want to use something more specific than a true
app.set('trust proxy', 1);
app.disable('x-powered-by');
// security see https://expressjs.com/en/advanced/best-practice-security.html

let sessionRedis = createClient({ legacyMode: true })
sessionRedis.connect().catch(console.error)

app.use(session({
    name: 'barryssuperdiscord',
    store: new RedisStore({
        client: sessionRedis
    }),
    secret,
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: true,
        httpOnly: true,
        domain: process.env.SERVER_DOMAIN
    },
    rolling: true
}));

/* more sec sutff */
const helmet = require('helmet');
/* https://securityheaders.com/ */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            defaultSrc: ["'self'"],
            styleSrc:   ["'self'"],
            scriptSrc:  ["'self'"],
            objectSrc:  ["'self'"],
            imgSrc:     ["'self' https: data:"]
        }
    },

    referrerPolicy: { policy: 'same-origin' },
    featurePolicy: {}
}));

/*
Generic Error logger
*/
app.use((err, req, res, next) => {
    //console.log('in here');
    if (err) {
        console.log(err);
    }
    next(err);
});

/*
register some pug globals
*/
app.use((req, res, next) => {
    if (req.hostname != process.env.SERVER_DOMAIN) {
        res.redirect(`https://${process.env.SERVER_DOMAIN}${req.originalUrl}`);
        return;
    }

    res.locals.twitch_client_id = process.env.TWITCH_CLIENT_ID;
    if (req.session.error) {
        res.locals.error = req.session.error;
        delete req.session.error;
        console.log('Captured error', res.locals.error);
    }
    if (req.session.success) {
        res.locals.success = req.session.success;
        delete req.session.success;
    }

    res.locals.session = req.session;

    next();
});

/*
Logout super important
*/
app.get('/logout', (req,res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/privacy', (req,res) => {
    res.render('privacy');
});

// modules
var twitch = require(path.join(__dirname, 'modules', 'twitch'))({ mysql_pool, redis_client });
var eventsub = require(path.join(__dirname, 'modules', 'eventsub'))({ mysql_pool, twitch });
var discord = require(path.join(__dirname, 'modules', 'discord'))({ mysql_pool, twitch });

// routes
app.use('/eventsub/', require(path.join(__dirname, 'routes', 'eventsub'))({ mysql_pool, eventsub, redis_client }));
app.use('/login/', require(path.join(__dirname, 'routes', 'login'))({ mysql_pool }));
app.use('/admin/', require(path.join(__dirname, 'routes', 'admin'))({ mysql_pool, eventsub, discord }));

// backup route
app.get('/', (req,res) => {
    res.render('home');
});
