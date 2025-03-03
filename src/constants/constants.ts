// const COGNITO_BASE_URL = 'https://us-east-1zflp836cb.auth.us-east-1.amazoncognito.com';
const COGNITO_BASE_URL = 'https://us-east-1zrxnq1fvu.auth.us-east-1.amazoncognito.com';

export const COGNITO_TOKEN_URL = `${COGNITO_BASE_URL}/oauth2/token`;

// export const COGNITO_CLIENT_ID = '4lcdtqstur6sh47v85usf4c2i5';
export const COGNITO_CLIENT_ID = '9buffmmd3fuau8p4nikb53oml';
export const COGNITO_REDIRECT_URI = 'screensense://callback';
export const COGNITO_AUTH_URL = `${COGNITO_BASE_URL}/login?client_id=${COGNITO_CLIENT_ID}&response_type=code&scope=email+openid+phone&redirect_uri=${COGNITO_REDIRECT_URI}`;
