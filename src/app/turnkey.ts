import { PublicKey, Transaction } from '@solana/web3.js';
import { init, TurnkeyActivityError, TurnkeyApi, withAsyncPolling } from '@turnkey/http';

init({
    apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
    apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
    baseUrl: process.env.TURNKEY_API_BASE_URL!,
});

export const PUBLIC_KEY = new PublicKey(process.env.TURNKEY_SOLANA_PUBLIC_KEY!);

const createPrivateKeys = withAsyncPolling({
    request: TurnkeyApi.createPrivateKeys,
    refreshIntervalMs: 250, // defaults to 500ms
});

export async function createPrivateKey() {
    const privateKeyName = ''; // FIXME

    const activity = await createPrivateKeys({
        body: {
            type: 'ACTIVITY_TYPE_CREATE_PRIVATE_KEYS_V2',
            organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
            timestampMs: Date.now().toString(),
            parameters: {
                privateKeys: [
                    {
                        privateKeyName,
                        curve: 'CURVE_ED25519',
                        addressFormats: [],
                        privateKeyTags: [],
                    },
                ],
            },
        },
    });

    const privateKeyId = activity.result.createPrivateKeysResult?.privateKeyIds[0];
    if (!privateKeyId)
        throw new TurnkeyActivityError({
            message: '',
        }); // FIXME

    const publicKey = await getPublicKey(privateKeyId);
}

export async function getPublicKey(privateKeyId: string): Promise<PublicKey> {
    const { privateKey } = await TurnkeyApi.getPrivateKey({
        body: {
            privateKeyId,
            organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
        },
    });
    const publicKey = new PublicKey(Buffer.from(privateKey.publicKey, 'hex'));
    return publicKey;
}

export async function signTransaction(
    transaction: Transaction,
    privateKeyId: string
): Promise<{ transaction: Transaction; publicKey: PublicKey }> {
    const { signature, publicKey } = await signMessage(transaction.serializeMessage(), privateKeyId);
    transaction.addSignature(publicKey, Buffer.from(signature));
    return { transaction, publicKey };
}

export async function signMessage(
    message: Uint8Array,
    privateKeyId: string
): Promise<{ signature: Uint8Array; publicKey: PublicKey }> {
    const [publicKey, { activity }] = await Promise.all([
        getPublicKey(privateKeyId),
        TurnkeyApi.signRawPayload({
            body: {
                type: 'ACTIVITY_TYPE_SIGN_RAW_PAYLOAD',
                organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
                timestampMs: Date.now().toString(),
                parameters: {
                    privateKeyId,
                    payload: Buffer.from(message).toString('hex'),
                    encoding: 'PAYLOAD_ENCODING_HEXADECIMAL',
                    hashFunction: 'HASH_FUNCTION_NOT_APPLICABLE',
                },
            },
        }),
    ]);
    const result = activity.result.signRawPayloadResult;
    if (!result)
        throw new TurnkeyActivityError({
            message: 'missing SIGN_RAW_PAYLOAD result',
            cause: null,
            activityId: activity.id,
            activityStatus: activity.status,
            activityType: activity.type,
        });
    const signature = new Uint8Array(Buffer.from(`${result.r}${result.s}`, 'hex'));
    return { signature, publicKey };
}
