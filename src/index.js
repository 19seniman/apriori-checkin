// src/index.js

import 'dotenv/config';
import { ethers } from 'ethers';
import chalk from 'chalk';
import { getNonce, login, getWalletStatus, updatePoints, collectWalletData, checkIn, getWalletActivity } from './utils/api.js';

const privateKey = process.env.PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey);
const walletAddress = wallet.address;

const MONAD_RPC_URL = process.env.MONAD_RPC_URL;
const CHECKIN_CONTRACT_ADDRESS = '0x703e753E9a2aCa1194DED65833EAec17dcFeAc1b';
const CHECKIN_CONTRACT_ABI = [
  {
    "inputs": [],
    "name": "checkIn",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// Ganti dengan hash transaksi check-in terbaru yang valid!
const monadTx = {
    transactionHash: '0xf537adec3bea28984e73231e98af8073478374baa4d15e2ac982a4e37de13b8a',
    chainId: 10143 // atau 10113 jika testnet
};

function buildSignMessage(nonceObj) {
    return (
        `${nonceObj.domain} wants you to sign in with your Ethereum account:\n` +
        `${nonceObj.address}\n\n` +
        `${nonceObj.statement}\n\n` +
        `URI: ${nonceObj.uri}\n` +
        `Version: ${nonceObj.version}\n` +
        `Chain ID: ${nonceObj.chainId}\n` +
        `Nonce: ${nonceObj.nonce}\n` +
        `Issued At: ${nonceObj.issuedAt}\n` +
        `Expiration Time: ${nonceObj.expirationTime}`
    );
}

function logStep(step, status, extra = '') {
    const time = new Date().toLocaleTimeString();
    let icon = status === 'success' ? chalk.green('✔') : status === 'fail' ? chalk.red('✖') : chalk.yellow('⚠️');
    console.log(`${chalk.gray(`[${time}]`)} ${icon} ${chalk.bold(step)} ${extra}`);
}

async function dailyCheckIn() {
    try {
        console.log(chalk.bgBlue.white.bold('\n=== AUTO CHECK-IN BOT by thedropsdata ===\n'));
        console.log(chalk.blueBright.bold('=== APR.IO AUTO DAILY CHECK-IN ===\n'));
        logStep('Wallet', 'success', chalk.yellow(walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4)));

        const nonceObj = await getNonce(walletAddress);
        logStep('Nonce', 'success');

        const message = buildSignMessage(nonceObj);
        const signature = await wallet.signMessage(message);

        const loginResponse = await login(walletAddress, signature, message);
        logStep('Login successful', 'success', chalk.gray(`User ID: ${loginResponse.user.id}`));

        const walletStatus = await getWalletStatus(walletAddress);
        logStep('Wallet status fetched', 'success');
        // Ringkas info status wallet
        const infoLine = `Check-in #${walletStatus.checkInCount || '-'} | Points: ${walletStatus.points || '-'} | Transactions: ${walletStatus.userTransactionCount || '-'}`;
        console.log(chalk.cyan.bold('\n--- WALLET STATUS ---'));
        console.log(chalk.cyan(infoLine));

        // === SMART CONTRACT CHECK-IN ===
        console.log(chalk.magenta.bold('\n--- SMART CONTRACT CHECK-IN (MONAD) ---'));
        let transactionHash;
        try {
            const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
            const walletWithProvider = wallet.connect(provider);
            const checkinContract = new ethers.Contract(CHECKIN_CONTRACT_ADDRESS, CHECKIN_CONTRACT_ABI, walletWithProvider);
            logStep('Sending checkIn() transaction', 'pending');
            const tx = await checkinContract.checkIn();
            logStep('Waiting for confirmation...', 'pending', chalk.gray(`Hash: ${tx.hash}`));
            const receipt = await tx.wait();
            transactionHash = receipt.hash || tx.hash;
            logStep('Transaction confirmed!', 'success');
        } catch (err) {
            console.error(chalk.bgRed.white.bold('\n=== SMART CONTRACT CHECK-IN FAILED ==='));
            console.error('Error message:', err.message);
            if (err.message && (err.message.toLowerCase().includes('already') || err.message.toLowerCase().includes('revert')) ) {
                console.log(chalk.yellow('⚠️  Already checked in today on smart contract!'));
            }
            return;
        }

        // === CHECK-IN KE API APR.IO ===
        console.log(chalk.magenta.bold('\n--- CHECK-IN TO APR.IO API ---'));
        try {
            const checkinResult = await checkIn({
                walletAddress,
                transactionHash,
                chainId: 10143, // Monad Testnet
                token: loginResponse.access_token
            });
            logStep('Check-in successful!', 'success');
            if (checkinResult.lastCheckinTime) {
                const lastCheckin = new Date(Number(checkinResult.lastCheckinTime));
                const nextCheckin = new Date(lastCheckin.getTime() + 24 * 60 * 60 * 1000);
                console.log(chalk.greenBright(`Last check-in: ${lastCheckin.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`));
                console.log(chalk.greenBright(`Can check-in again: ${nextCheckin.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`));
                if (Date.now() < nextCheckin.getTime()) {
                    console.log(chalk.yellow('⚠️  You are trying to check-in before 24 hours have passed since your last check-in. Check-in can only be done every 24 hours from the last check-in time, not every 00:00.'));
                }
            }
            console.log(chalk.bgGreen.white.bold('\n=== CHECK-IN COMPLETE ===\n'));
        } catch (err) {
            // If check-in to API fails, just show this message
            console.log(chalk.yellow('⚠️  Already checked in today!'));
            // Always show footer
            console.log(chalk.bgBlue.white.bold('\nAuto check-in bot by thedropsdata | https://thedropsadata.online\n'));
            return;
        }

        // === UPDATE POINTS & QUEST DATA (opsional, ringkas) ===
        await updatePoints(loginResponse.access_token);
        logStep('Points updated', 'success');
        const walletData = await collectWalletData(walletAddress, loginResponse.access_token);
        logStep('Wallet quest data', 'success');
        // Ringkas quest data
        const questInfo = Object.entries(walletData)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ');
        console.log(chalk.cyan.bold('\n--- WALLET QUEST DATA ---'));
        console.log(chalk.cyan(questInfo));
        console.log(chalk.bgGreen.white.bold('\n=== CHECK-IN COMPLETE ===\n'));
        // Footer
        console.log(chalk.bgBlue.white.bold('\nAuto check-in bot by thedropsdata | https://thedropsadata.online\n'));
    } catch (error) {
        logStep('Error during daily check-in', 'fail', chalk.red(error.message || error));
    }
}

dailyCheckIn();
