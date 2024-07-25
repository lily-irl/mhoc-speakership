const jwt = require('jsonwebtoken')
const express = require('express')
const router = express.Router()
const axios = require('axios')

const { TOKEN_SECRET, OAUTH, REDDIT } = require('../credentials.json')
const AUTHORISED_USERS = require('../users.json')

function generateToken(username, access_token) {
    return jwt.sign({ data: username, token: access_token }, TOKEN_SECRET, { expiresIn: '1800s' })
}

function authenticateToken(req, res, next) {
    const EXCLUDED_ROUTES = ['/', '/login', '/callback']

    if (EXCLUDED_ROUTES.includes(req.path))
        return next()

    const token = req.session.token

    if (token == null) return res.redirect('/login')

    jwt.verify(token, TOKEN_SECRET, (err, user) => {
        if (err) return res.redirect('/login')
        req.user = user
        next()
    })
}

router.get('/login', (req, res) => {
    return res.render('login', { callback_uri: OAUTH['callback_uri'], client_id: OAUTH['clientId'] })
})

router.get('/callback', (req, res) => {
    if (req.query['error'])
        return res.render('error', { error: req.body['error'] })
    if (req.query['code']) {
        // step 1
        axios.post('https://www.reddit.com/api/v1/access_token', {
            'grant_type': 'authorization_code',
            'code': req.query['code'],
            'redirect_uri': OAUTH['callback_uri']
        }, {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(OAUTH.clientId + ':' + OAUTH.clientSecret).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }).then(auth_response => {
            if (auth_response.data.error)
                return res.render('error', { error: auth_response.error })
            // step 2: confirm identity
            axios.get('https://oauth.reddit.com/api/v1/me', {
                headers: {
                    'Authorization': 'Bearer ' + auth_response.data.access_token,
                    'Content-Type': 'application/json',
                    'User-Agent': REDDIT['userAgent']
                }
            }).then(user => {
                if (AUTHORISED_USERS.includes(user.data.name)) {
                    const token = generateToken(user.data.name, auth_response.data.access_token)
                    req.session.token = token
                    return res.redirect('/')
                }
                return res.render('error', { error: 'Your account, ' + user.data.name + ', is not authorised to use the site. Please contact an admin if you believe this is in error.' })
            }).catch(error => console.error)
        }).catch(error => console.error)
    }
})

module.exports = { router: router, authenticator: authenticateToken }
