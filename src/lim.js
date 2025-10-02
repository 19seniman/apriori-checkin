// src/lim.js

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

// --- Custom Logger Implementation using Chalk ---
const colors = {
    cyan: chalk.cyan,
    yellow: chalk.yellow,
    red: chalk.red,
    green: chalk.green,
    magenta: chalk.magenta,
    blue: chalk.blue,
    bold: chalk.bold,
    gray: chalk.gray,
    white: chalk.white,
    // Kita tidak mendefinisikan 'reset' karena chalk menanganinya
};

const logger = {
    info: (msg) => console.log(`${colors.cyan('[i]')} ${msg}`),
    warn: (msg) => console.log(`${colors.yellow('[!]')} ${msg}`),
    error: (msg) => console.log(`${colors.red('[x]')} ${msg}`),
    success: (msg) => console.log(`${colors.green('[+]} ${msg}`),
    loading: (msg) => console.log(`${colors.magenta('[*]')} ${msg}`),
    step: (msg) => console.log(`${colors.blue('[>]')} ${colors.bold(msg)}`),
    critical: (msg) => console.log(colors.red.bold('[FATAL]') + ' ' + msg),
    summary: (msg) => console.log(colors.green.bold('[SUMMARY]') + ' ' + msg),
    banner: () => {
        const border = colors.blue.bold('╔═════════════════════════════════════════╗');
        const title = colors.blue.bold('║   🍉 19Seniman From Insider    🍉   ║');
        const bottomBorder = colors.blue.bold('╚═════════════════════════════════════════╝');
        console.log(`\n${border}`);
        console.log(title);
        console.log(`${bottomBorder}\n`);
    },
    section: (msg) => {
        const line = '─'.repeat(40);
        console.log(`\n${colors.gray(line)}`);
        if (msg) console.log(colors.white.bold(` ${msg} `));
        console.log(`${colors.gray(line)}\n`);
    },
    countdown: (msg) => process.stdout.write(`\r${colors.blue('[⏰]')} ${msg}`),
};
// --- End Custom Logger ---

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

/**
 * Menjalankan satu kali proses check-in harian.
 * @returns {object} Mengembalikan { nextRunTime: number, runAgain: boolean }
 */
async function dailyCheckIn() {
    // Default next run time: 24 jam dari sekarang
    let nextRunTime = Date.now() + (24 * 60 * 60 * 1000); 
    let runAgain = true; 

    try {
        logger.step('Starting APR.IO Auto Check-in Bot Run');
        
        logger.info(`Wallet Address: ${chalk.yellow(walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4))}`);

        const nonceObj = await getNonce(walletAddress);
        logger.success('Nonce fetched successfully.');

        const message = buildSignMessage(nonceObj);
        const signature = await wallet.signMessage(message);

        const loginResponse = await login(walletAddress, signature, message);
        logger.success(`Login successful. User ID: ${chalk.gray(loginResponse.user.id)}`);

        // Awal, ambil status untuk logging
        let walletStatus = await getWalletStatus(walletAddress);
        logger.info('Wallet status fetched.');

        // Ringkas info status wallet
        const infoLine = `Check-in #${walletStatus.checkInCount || '-'} | Points: ${walletStatus.points || '-'} | Transactions: ${walletStatus.userTransactionCount || '-'}`;
        logger.section('WALLET STATUS');
        logger.info(infoLine);

        // === SMART CONTRACT CHECK-IN ===
        logger.section('SMART CONTRACT CHECK-IN (MONAD)');
        let transactionHash;
        try {
            const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
            const walletWithProvider = wallet.connect(provider);
            const checkinContract = new ethers.Contract(CHECKIN_CONTRACT_ADDRESS, CHECKIN_CONTRACT_ABI, walletWithProvider);
            
            logger.loading('Sending checkIn() transaction...');
            const tx = await checkinContract.checkIn();
            
            logger.loading(`Waiting for confirmation... Hash: ${chalk.gray(tx.hash)}`);
            const receipt = await tx.wait();
            
            transactionHash = receipt.hash || tx.hash;
            logger.success('Transaction confirmed!');
        } catch (err) {
            logger.critical('SMART CONTRACT CHECK-IN FAILED');
            console.error('Error message:', err.message);
            if (err.message && (err.message.toLowerCase().includes('already') || err.message.toLowerCase().includes('revert')) ) {
                logger.warn('Already checked in today on smart contract. Proceeding to API check.');
            } else {
                // Jika SC check-in gagal karena alasan lain, anggap proses gagal untuk saat ini.
                logger.step('\n=== END OF CURRENT PROCESS RUN (SC Error) ===\n'); 
                return { nextRunTime, runAgain: true }; // Continue loop based on default 24h wait
            }
        }

        // === CHECK-IN KE API APR.IO ===
        logger.section('CHECK-IN TO APR.IO API');
        try {
            const checkinResult = await checkIn({
                walletAddress,
                transactionHash,
                chainId: 10143, // Monad Testnet
                token: loginResponse.access_token
            });
            
            logger.success('Check-in successful via API!');
            
            if (checkinResult.lastCheckinTime) {
                const lastCheckin = new Date(Number(checkinResult.lastCheckinTime));
                const nextCheckin = new Date(lastCheckin.getTime() + 24 * 60 * 60 * 1000);
                nextRunTime = nextCheckin.getTime(); // Gunakan waktu check-in resmi
                
                logger.info(`Last check-in: ${chalk.greenBright(lastCheckin.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}`);
                logger.info(`Next eligible check-in: ${chalk.greenBright(nextCheckin.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}`);
                
                if (Date.now() < nextCheckin.getTime()) {
                    logger.warn('The bot will wait until the next eligible time to run again.');
                }
            }
            logger.summary('DAILY CHECK-IN COMPLETE');

            // === UPDATE POINTS & QUEST DATA (opsional, ringkas) ===
            await updatePoints(loginResponse.access_token);
            logger.success('Points updated.');
            
            const walletData = await collectWalletData(walletAddress, loginResponse.access_token);
            logger.info('Wallet quest data fetched.');
            
            // Ringkas quest data
            const questInfo = Object.entries(walletData)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' | ');
            
            logger.section('WALLET QUEST DATA');
            logger.info(questInfo);
            
            logger.summary('PROCESS FINISHED');

        } catch (err) {
            // Jika API check-in gagal (kemungkinan sudah check-in)
            logger.warn('API Check-in failed (might be due to 24h limit or server error).');
            // Coba ambil status lagi untuk mendapatkan lastCheckinTime yang paling baru
            try {
                 const statusAfterFail = await getWalletStatus(walletAddress);
                 if (statusAfterFail.lastCheckinTime) {
                    const lastCheckin = new Date(Number(statusAfterFail.lastCheckinTime));
                    const nextCheckin = new Date(lastCheckin.getTime() + 24 * 60 * 60 * 1000);
                    nextRunTime = nextCheckin.getTime();
                    logger.info(`Next run time determined from status: ${chalk.greenBright(nextCheckin.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}`);
                 }
            } catch (statusErr) {
                 logger.error(`Could not fetch wallet status to determine next run time: ${statusErr.message}. Using default 24h wait.`);
            }
        }
        
    } catch (error) {
        logger.critical(`Error during daily check-in: ${error.message || error}`);
        runAgain = false; // Stop loop on critical failure (e.g., login failure)
    }
    
    logger.step('\n=== END OF CURRENT PROCESS RUN ===\n');
    return { nextRunTime, runAgain };
}

/**
 * Memulai loop bot untuk menjalankan check-in secara periodik.
 */
async function startBotLoop() {
    logger.banner();
    logger.step('Starting APR.IO Auto Check-in Bot Loop...');
    
    // Looping tak terbatas
    while (true) {
        // Jalankan proses utama
        const result = await dailyCheckIn();
        
        if (!result.runAgain) {
            logger.critical('Bot encountered a critical error and stopped the loop.');
            break;
        }
        
        const now = Date.now();
        let waitTime = result.nextRunTime - now;
        
        // Pastikan waitTime tidak negatif atau nol
        if (waitTime <= 0) {
            logger.warn('Next check-in time is in the past or now. Waiting 1 minute before next attempt to prevent rapid loop.');
            waitTime = 60000; // Tunggu 1 menit untuk mencegah loop cepat
        }
        
        // Menampilkan informasi waktu tunggu
        const nextRunTimeFormatted = new Date(result.nextRunTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        
        logger.section('WAITING FOR NEXT CHECK-IN');
        logger.info(`Next run is scheduled for: ${chalk.blue.bold(nextRunTimeFormatted)}`);
        
        // Countdown
        let remainingTime = waitTime;
        const countdownInterval = 5000; // Update setiap 5 detik
        
        while (remainingTime > 0) {
            const displayHours = Math.floor(remainingTime / (1000 * 60 * 60));
            const displayMinutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            const displaySeconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
            
            logger.countdown(`Next run in: ${displayHours}h ${displayMinutes}m ${displaySeconds}s `);
            
            const timeToWait = Math.min(remainingTime, countdownInterval);
            await sleep(timeToWait);
            
            remainingTime -= timeToWait;
        }
        
        // Membersihkan baris countdown
        process.stdout.write('\r' + ' '.repeat(50) + '\r');
        logger.loading('Wait complete. Starting next check-in run...');
    }
}

// Mulai loop bot
startBotLoop();
