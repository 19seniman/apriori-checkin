// src/index.js

import 'dotenv/config';
import { ethers } from 'ethers';
// Mengganti import 'chalk' dengan variabel warna ANSI
// import chalk from 'chalk'; 
import { getNonce, login, getWalletStatus, updatePoints, collectWalletData, checkIn } from './utils/api.js';

// --- DEFINISI VARIABEL WARNA ANSI SEDERHANA ---
const colors = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m"
};

// --- DEFINISI LOGGER BARU ---
const logger = {
    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[x] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.magenta}[*] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.blue}[>] ${colors.bold}${msg}${colors.reset}`),
    critical: (msg) => console.log(`${colors.red}${colors.bold}[FATAL] ${msg}${colors.reset}`),
    summary: (msg) => console.log(`${colors.green}${colors.bold}[SUMMARY] ${msg}${colors.reset}`),
    banner: () => {
        const border = `${colors.blue}${colors.bold}╔═════════════════════════════════════════╗${colors.reset}`;
        const title = `${colors.blue}${colors.bold}║   🍉 19Seniman From Insider    🍉   ║${colors.reset}`;
        const bottomBorder = `${colors.blue}${colors.bold}╚═════════════════════════════════════════╝${colors.reset}`;
        
        console.log(`\n${border}`);
        console.log(`${title}`);
        console.log(`${bottomBorder}\n`);
    },
    section: (msg) => {
        const line = '─'.repeat(40);
        console.log(`\n${colors.gray}${line}${colors.reset}`);
        if (msg) console.log(`${colors.white}${colors.bold} ${msg} ${colors.reset}`);
        console.log(`${colors.gray}${line}${colors.reset}\n`);
    },
    countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
};


// --- KONFIGURASI INI HARUS DIISI DI FILE .env ---
const privateKey = process.env.PRIVATE_KEY;
const MONAD_RPC_URL = process.env.MONAD_RPC_URL;
// ------------------------------------------------

if (!privateKey || !MONAD_RPC_URL) {
    logger.critical('PRIVATE_KEY atau MONAD_RPC_URL tidak ditemukan di file .env!');
    process.exit(1);
}

const wallet = new ethers.Wallet(privateKey);
const walletAddress = wallet.address;

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

// Konstanta waktu
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let lastCheckinTimeMs = 0; // Waktu check-in terakhir dalam milidetik

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

// Fungsi logStep lama dihilangkan dan diganti dengan logger.step / logger.error / logger.success
// logStep(step, status, extra = '') { ... }

async function dailyCheckIn() {
    logger.banner();
    logger.step('APR.IO AUTO DAILY CHECK-IN (MONAD)');
    logger.info(`Wallet Address: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);

    let loginResponse = null;
    try {
        logger.section('AUTENTIKASI & STATUS WALLET');
        
        // --- AUTENTIKASI ---
        logger.loading('Getting Nonce...');
        const nonceObj = await getNonce(walletAddress);
        logger.success('Nonce received.');

        const message = buildSignMessage(nonceObj);
        const signature = await wallet.signMessage(message);

        logger.loading('Logging in...');
        loginResponse = await login(walletAddress, signature, message);
        logger.success(`Login successful! User ID: ${loginResponse.user.id}`);

        // --- STATUS WALLET ---
        logger.loading('Fetching wallet status...');
        const walletStatus = await getWalletStatus(walletAddress);
        logger.success('Wallet status fetched.');
        
        logger.summary(`Check-in #${walletStatus.checkInCount || '-'} | Points: ${walletStatus.points || '-'} | TX Count: ${walletStatus.userTransactionCount || '-'}`);

    } catch (error) {
        logger.error(`Autentikasi/Status Gagal: ${error.message || error}`);
        return; 
    }


    // === SMART CONTRACT CHECK-IN ===
    logger.section('SMART CONTRACT CHECK-IN (MONAD)');
    let transactionHash;
    try {
        const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
        const walletWithProvider = wallet.connect(provider);
        const checkinContract = new ethers.Contract(CHECKIN_CONTRACT_ADDRESS, CHECKIN_CONTRACT_ABI, walletWithProvider);
        
        logger.loading('Sending checkIn() transaction...');
        const tx = await checkinContract.checkIn();
        
        logger.loading(`Waiting for confirmation... Hash: ${tx.hash.slice(0, 10)}...`);
        const receipt = await tx.wait();
        transactionHash = receipt.hash || tx.hash;
        logger.success(`Transaction confirmed! Hash: ${transactionHash.slice(0, 10)}...`);
    } catch (err) {
        // Jika transaksi gagal karena sudah check-in/revert
        if (err.message && (err.message.toLowerCase().includes('already') || err.message.toLowerCase().includes('revert'))) {
            logger.warn('Smart Contract Check-in failed: Already checked in today on smart contract. Skipping API check-in.');
            return; 
        }
        
        logger.critical(`SMART CONTRACT CHECK-IN FAILED: ${err.message}`);
        return; 
    }

    // === CHECK-IN KE API APR.IO ===
    logger.section('CHECK-IN TO APR.IO API');
    let checkinSuccessful = false;
    try {
        logger.loading('Sending check-in request to APR.IO API...');
        const checkinResult = await checkIn({
            walletAddress,
            transactionHash,
            chainId: 10143, // Monad Testnet
            token: loginResponse.access_token
        });
        logger.success('Check-in to API successful!');
        checkinSuccessful = true;
        
        if (checkinResult.lastCheckinTime) {
            lastCheckinTimeMs = Number(checkinResult.lastCheckinTime); 
            const lastCheckin = new Date(lastCheckinTimeMs);
            const nextCheckin = new Date(lastCheckinTimeMs + ONE_DAY_MS);
            
            logger.info(`Last check-in: ${lastCheckin.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
            logger.info(`Can check-in again: ${nextCheckin.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
            
            if (Date.now() < nextCheckin.getTime()) {
                logger.warn('Check-in berhasil, namun masih dalam periode 24 jam dari check-in terakhir.');
            }
        }
    } catch (err) {
        // Jika check-in ke API gagal (kemungkinan sudah check-in)
        logger.error(`Check-in API failed: ${err.message || 'Unknown error!'}`);
        logger.warn('Check-in API gagal (kemungkinan sudah check-in/duplikat transaksi)!');
    }

    if (checkinSuccessful) {
        // === UPDATE POINTS & QUEST DATA ===
        logger.section('UPDATING POINTS & QUEST DATA');
        try {
            logger.loading('Updating points...');
            await updatePoints(loginResponse.access_token);
            logger.success('Points updated.');
            
            logger.loading('Fetching wallet quest data...');
            const walletData = await collectWalletData(walletAddress, loginResponse.access_token);
            logger.success('Wallet quest data fetched.');
            
            const questInfo = Object.entries(walletData)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' | ');
            logger.summary(`Quest Data: ${questInfo}`);
        } catch (err) {
            logger.error(`Update Data Failed: Gagal memperbarui points/quest.`);
        }
    }
    
    logger.section('SESI CHECK-IN SELESAI');
}

async function runAutoCheckIn() {
    await dailyCheckIn();

    // Hitung waktu tunggu berikutnya
    const nextCheckinTime = lastCheckinTimeMs + ONE_DAY_MS;
    const waitTime = nextCheckinTime - Date.now();
    
    let delay = ONE_DAY_MS; // Default 24 jam jika waktu check-in belum terekam
    
    if (waitTime > 0) {
        // Jika masih dalam periode 24 jam, tunggu sisanya
        delay = waitTime;
        const waitHours = Math.floor(delay / (60 * 60 * 1000));
        const waitMinutes = Math.floor((delay % (60 * 60 * 1000)) / (60 * 1000));
        const nextCheckinDate = new Date(nextCheckinTime);

        logger.step('MENUNGGU SIKLUS BERIKUTNYA...');
        logger.warn(`Waktu tunggu: ${waitHours} jam ${waitMinutes} menit.`);
        logger.info(`Check-in akan dilanjutkan pada: ${nextCheckinDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
    } else {
        // Jika sudah melewati 24 jam atau pertama kali jalan, tunggu 24 jam penuh dari sekarang
        logger.step('CHECK-IN BERHASIL/SELESAI. MENUNGGU 24 JAM UNTUK SIKLUS BERIKUTNYA.');
    }

    // Set timeout untuk menjalankan fungsi lagi setelah waktu tunggu
    setTimeout(() => {
        runAutoCheckIn(); 
    }, delay);
}

runAutoCheckIn();
