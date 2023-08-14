'use client';

import { ed25519 } from '@noble/curves/ed25519';
import { clusterApiUrl, Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { browserInit } from '@turnkey/http';
import bs58 from 'bs58';
import { useCallback, useEffect, useMemo } from 'react';
import { toast, Toaster } from 'sonner';
import { getRandomBytes } from './bytes';
import { useLocalStorage } from './hooks/useLocalStorage';
import styles from './page.module.css';
import { register, Registration, signBytes } from './turnkey';

export default function Home() {
    useEffect(() => browserInit({ baseUrl: process.env.NEXT_PUBLIC_TURNKEY_API_BASE_URL! }), []);

    const [registration, setRegistration] = useLocalStorage<Registration | null>('registration', null);
    const publicKey = useMemo(() => (registration ? new PublicKey(registration.publicKey) : null), [registration]);
    const connection = useMemo(() => new Connection(clusterApiUrl('devnet')), []);

    const onRegister = useCallback(async () => {
        if (registration) return;

        toast('Registering ...');
        let newRegistration: Registration;
        try {
            newRegistration = await register();
            setRegistration(newRegistration);
        } catch (error) {
            toast.error('Registration failed!', { description: String(error) });
            return;
        }

        toast.success('Registered successfully!', {
            description: `Your public key is ${newRegistration.publicKey}`,
            action: {
                label: 'View',
                onClick: () =>
                    window.open(`https://explorer.solana.com/address/${newRegistration.publicKey}?cluster=devnet`),
            },
        });
    }, [registration, setRegistration]);

    const onSignMessage = useCallback(async () => {
        if (!registration || !publicKey) return;
        const bytes = getRandomBytes(32);
        toast('Signing ...');
        let signature: Uint8Array;
        try {
            ({ signature } = await signBytes({
                bytes,
                subOrganizationId: registration.subOrganizationId,
                privateKeyId: registration.privateKeyId,
            }));
        } catch (error) {
            toast.error('Signing failed!', { description: String(error) });
            return;
        }

        if (!ed25519.verify(signature, bytes, publicKey.toBytes())) {
            toast.error('Signature invalid!', {
                description: `Your message signature is ${bs58.encode(signature)}`,
            });
            return;
        }

        toast.success('Signature verified!', {
            description: `Your message signature is ${bs58.encode(signature)}`,
        });
    }, [registration, publicKey]);

    const onRequestAirdrop = useCallback(async () => {
        if (!publicKey) return;

        toast('Requesting airdrop ...');
        let txid: string;
        try {
            txid = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);
        } catch (error) {
            toast.error('Airdrop failed!', { description: String(error) });
            return;
        }

        toast.success('Airdrop requested!', {
            description: '',
            action: {
                label: 'View',
                onClick: () => window.open(`https://explorer.solana.com/tx/${txid}?cluster=devnet`),
            },
        });

        toast('Confirming airdrop ...');
        try {
            await connection.confirmTransaction(txid, 'confirmed');
        } catch (error) {
            toast.error('Airdrop failed!', {
                description: String(error),
                action: {
                    label: 'View',
                    onClick: () => window.open(`https://explorer.solana.com/tx/${txid}?cluster=devnet`),
                },
            });
            return;
        }

        toast.success('Airdrop confirmed!', {
            action: {
                label: 'View',
                onClick: () => window.open(`https://explorer.solana.com/tx/${txid}?cluster=devnet`),
            },
        });
    }, [publicKey, connection]);

    const onSignAndSendTransaction = useCallback(async () => {
        if (!registration || !publicKey) return;

        toast('Preparing transaction ...');
        const {
            value: { blockhash, lastValidBlockHeight },
            context: { slot: minContextSlot },
        } = await connection.getLatestBlockhashAndContext();
        const transaction = new Transaction({
            feePayer: publicKey,
            blockhash,
            lastValidBlockHeight,
        }).add(
            SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: publicKey,
                lamports: 0,
            })
        );
        const bytes = transaction.serializeMessage();

        toast('Signing transaction ...');
        let signature: Uint8Array;
        try {
            ({ signature } = await signBytes({
                bytes,
                subOrganizationId: registration.subOrganizationId,
                privateKeyId: registration.privateKeyId,
            }));
        } catch (error) {
            toast.error('Signing failed!', { description: String(error) });
            return;
        }

        transaction.addSignature(publicKey, Buffer.from(signature));
        if (!transaction.verifySignatures()) {
            toast.error('Signature invalid!', {
                description: `Your transaction signature is ${bs58.encode(signature)}`,
            });
            return;
        }

        toast.success('Signature verified!', {
            description: `Your transaction signature is ${bs58.encode(signature)}`,
        });

        toast('Sending transaction ...');
        let txid: string;
        try {
            txid = await connection.sendRawTransaction(transaction.serialize(), {
                minContextSlot,
            });
        } catch (error) {
            toast.error('Sending failed!', { description: String(error) });
            return;
        }

        toast.success('Transaction sent!', {
            action: {
                label: 'View',
                onClick: () => window.open(`https://explorer.solana.com/tx/${txid}?cluster=devnet`),
            },
        });

        toast('Confirming transaction ...');
        try {
            await connection.confirmTransaction(
                {
                    signature: txid,
                    blockhash,
                    lastValidBlockHeight,
                    minContextSlot,
                },
                'confirmed'
            );
        } catch (error) {
            toast.error('Transaction failed!', {
                description: String(error),
                action: {
                    label: 'View',
                    onClick: () => window.open(`https://explorer.solana.com/tx/${txid}?cluster=devnet`),
                },
            });
            return;
        }

        toast.success('Transaction confirmed!', {
            action: {
                label: 'View',
                onClick: () => window.open(`https://explorer.solana.com/tx/${txid}?cluster=devnet`),
            },
        });
    }, [registration, publicKey, connection]);

    return (
        <main className={styles.main}>
            {!registration ? (
                <button className={styles.button} onClick={onRegister}>
                    Register
                </button>
            ) : (
                <>
                    <button className={styles.button} onClick={onSignMessage}>
                        Sign Message
                    </button>
                    <button className={styles.button} onClick={onRequestAirdrop}>
                        Request Airdrop
                    </button>
                    <button className={styles.button} onClick={onSignAndSendTransaction}>
                        Sign and Send Transaction
                    </button>
                </>
            )}
            <Toaster
                position="bottom-center"
                theme="dark"
                richColors
                closeButton
                visibleToasts={7}
                duration={5000}
                toastOptions={{ className: 'toast' }}
            />
        </main>
    );
}
