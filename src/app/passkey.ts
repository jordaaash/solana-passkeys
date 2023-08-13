import { client, parsers } from '@passwordless-id/webauthn';

export async function register() {
    if (!client.isAvailable()) throw new Error('webauthn unavailable');

    const challengeResponse = await fetch('/api/register');
    const { challenge } = await challengeResponse.json();
    console.debug(challenge);

    const registration = await client.register('Solana Passkey Wallet', challenge, {
        authenticatorType: 'both',
        userVerification: 'required',
    });
    console.debug(registration);
    const parsed = parsers.parseRegistration(registration);
    console.debug(parsed);

    const verifyResponse = await fetch('/api/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ registration }),
    });
    const {} = await verifyResponse.json();
    console.debug();

    window.localStorage.setItem('credentialId', parsed.credential.id);

    return parsed;
}

export async function authenticate() {
    if (!client.isAvailable()) throw new Error('webauthn unavailable');

    let credentialId = window.localStorage.getItem('credentialId');
    if (!credentialId) {
        const registration = await register();
        credentialId = registration.credential.id;
    }

    const authentication = await client.authenticate(credentialId ? [credentialId] : [], window.crypto.randomUUID(), {
        authenticatorType: 'both',
        userVerification: 'required',
    });
    console.debug(authentication);

    const parsed = parsers.parseAuthentication(authentication);
    console.log(parsed);

    return parsed;
}
