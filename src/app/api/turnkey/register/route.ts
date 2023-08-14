import { init, TurnkeyActivityError, TurnkeyApi, TurnkeyApiTypes, withAsyncPolling } from '@turnkey/http';
import {
    getPrivateKey,
    getUsers,
} from '@turnkey/http/dist/__generated__/services/coordinator/public/v1/public_api.fetcher';
import { NextRequest, NextResponse } from 'next/server';
import bs58 from 'bs58';

init({
    apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
    apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
    baseUrl: process.env.TURNKEY_API_BASE_URL!,
});

const createSubOrganization = withAsyncPolling({
    request: TurnkeyApi.createSubOrganization,
    refreshIntervalMs: 250,
});

const createPrivateKeys = withAsyncPolling({
    request: TurnkeyApi.createPrivateKeys,
    refreshIntervalMs: 250,
});

const updateRootQuorum = withAsyncPolling({
    request: TurnkeyApi.updateRootQuorum,
    refreshIntervalMs: 250,
});

export type POSTResponse = {
    subOrganizationId: string;
    privateKeyId: string;
    publicKey: string;
};

export async function POST(request: NextRequest): Promise<NextResponse<POSTResponse>> {
    const {
        challenge,
        attestation,
    }: {
        challenge: string;
        attestation: TurnkeyApiTypes['v1Attestation'];
    } = await request.json();

    // Create a new sub-org for the user.
    const createSubOrganizationActivity = await createSubOrganization({
        body: {
            type: 'ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION_V2',
            timestampMs: Date.now().toString(),
            organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
            parameters: {
                subOrganizationName: 'Sub Organization Name', // FIXME
                rootQuorumThreshold: 1,
                rootUsers: [
                    {
                        userName: 'Passkey',
                        apiKeys: [],
                        authenticators: [
                            {
                                authenticatorName: 'Passkey',
                                challenge,
                                attestation,
                            },
                        ],
                    },
                    // Add a helper root user using the root org API key to create a private key without attestation.
                    {
                        userName: 'Helper',
                        apiKeys: [
                            {
                                apiKeyName: 'Helper',
                                publicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
                            },
                        ],
                        authenticators: [],
                    },
                ],
            },
        },
    });

    const subOrganizationId = createSubOrganizationActivity.result.createSubOrganizationResult?.subOrganizationId;
    if (!subOrganizationId)
        throw new TurnkeyActivityError({
            message: 'missing CREATE_SUB_ORGANIZATION result',
            cause: null,
            activityId: createSubOrganizationActivity.id,
            activityStatus: createSubOrganizationActivity.status,
            activityType: createSubOrganizationActivity.type,
        });

    // Create a private key using the helper root user API key.
    const createPrivateKeysActivity = await createPrivateKeys({
        body: {
            type: 'ACTIVITY_TYPE_CREATE_PRIVATE_KEYS_V2',
            organizationId: subOrganizationId,
            timestampMs: Date.now().toString(),
            parameters: {
                privateKeys: [
                    {
                        privateKeyName: 'Private Key', // FIXME
                        curve: 'CURVE_ED25519',
                        addressFormats: [],
                        privateKeyTags: [],
                    },
                ],
            },
        },
    });

    const privateKeyId = createPrivateKeysActivity.result.createPrivateKeysResultV2?.privateKeys[0]?.privateKeyId;
    if (!privateKeyId)
        throw new TurnkeyActivityError({
            message: 'missing CREATE_PRIVATE_KEYS result',
            cause: null,
            activityId: createSubOrganizationActivity.id,
            activityStatus: createSubOrganizationActivity.status,
            activityType: createSubOrganizationActivity.type,
        });

    // Get the public key of the private key.
    const { privateKey } = await getPrivateKey({
        body: {
            privateKeyId,
            organizationId: subOrganizationId,
        },
    });
    const publicKey = bs58.encode(Buffer.from(privateKey.publicKey, 'hex'));

    // Enumerate the users in the sub-org and remove the helper root user from the root quorum.
    const users = await getUsers({
        body: {
            organizationId: subOrganizationId,
        },
    });
    for (const user of users.users) {
        if (user.userName === 'Passkey') {
            await updateRootQuorum({
                body: {
                    type: 'ACTIVITY_TYPE_UPDATE_ROOT_QUORUM',
                    organizationId: subOrganizationId,
                    timestampMs: Date.now().toString(),
                    parameters: {
                        userIds: [user.userId],
                        threshold: 1,
                    },
                },
            });
            break;
        }
    }

    return NextResponse.json({ subOrganizationId, privateKeyId, publicKey });
}
