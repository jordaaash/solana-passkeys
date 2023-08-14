'use client';

import { ed25519 } from '@noble/curves/ed25519';
import { clusterApiUrl, Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { browserInit } from '@turnkey/http';
import { useCallback, useEffect, useMemo } from 'react';
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
        const newRegistration = await register();
        setRegistration(newRegistration);

        console.log(`https://explorer.solana.com/address/${newRegistration.publicKey}`);
        alert(`Registered: ${newRegistration.publicKey}`);
    }, [registration, setRegistration]);

    const onSignMessage = useCallback(async () => {
        if (!registration || !publicKey) return;
        const bytes = getRandomBytes(32);
        const { signature } = await signBytes({
            bytes,
            subOrganizationId: registration.subOrganizationId,
            privateKeyId: registration.privateKeyId,
        });

        alert(`Message signature valid? ${ed25519.verify(signature, bytes, publicKey.toBytes())}`);
    }, [registration, publicKey]);

    const onRequestAirdrop = useCallback(async () => {
        if (!publicKey) return;
        const txid = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);

        console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`);
        alert(`Airdrop requested! ${txid}`);

        await connection.confirmTransaction(txid, 'confirmed');

        alert(`Airdrop confirmed! ${txid}`);
    }, [publicKey, connection]);

    const onSignAndSendTransaction = useCallback(async () => {
        if (!registration || !publicKey) return;

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

        const { signature } = await signBytes({
            bytes: transaction.serializeMessage(),
            subOrganizationId: registration.subOrganizationId,
            privateKeyId: registration.privateKeyId,
        });

        transaction.addSignature(publicKey, Buffer.from(signature));

        alert(`Transaction signature valid? ${transaction.verifySignatures()}`);

        const txid = await connection.sendRawTransaction(transaction.serialize(), {
            minContextSlot,
        });

        console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`);
        alert(`Transaction sent! ${txid}`);

        await connection.confirmTransaction(
            {
                signature: txid,
                blockhash,
                lastValidBlockHeight,
                minContextSlot,
            },
            'confirmed'
        );

        alert(`Transaction confirmed! ${txid}`);
    }, [registration, publicKey, connection]);

    return (
        <main className={styles.main}>
            {!registration ? (
                <button onClick={onRegister}>Register</button>
            ) : (
                <div>
                    <button onClick={onSignMessage}>Sign Message</button>
                    <button onClick={onRequestAirdrop}>Request Airdrop</button>
                    <button onClick={onSignAndSendTransaction}>Sign and Send Transaction</button>
                </div>
            )}
        </main>
    );
}
