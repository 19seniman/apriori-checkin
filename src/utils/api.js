import axios from 'axios';

const API_BASE_URL = 'https://wallet-collection-api.apr.io';

export const getNonce = async (walletAddress) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/auth/nonce/${walletAddress}`, {
            headers: {
                'accept': '*/*',
                'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'dnt': '1',
                'origin': 'https://of.apr.io',
                'referer': 'https://of.apr.io',
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching nonce:', error);
        throw error;
    }
};

export const login = async (walletAddress, signature, message) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/auth/login`, {
            walletAddress,
            signature,
            message
        }, {
            headers: {
                'accept': '*/*',
                'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'content-type': 'application/json',
                'dnt': '1',
                'origin': 'https://of.apr.io',
                'referer': 'https://of.apr.io',
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error during login:', error);
        throw error;
    }
};

export const getWalletStatus = async (walletAddress) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/wallet_status/${walletAddress}`, {
            headers: {
                'accept': '*/*',
                'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'dnt': '1',
                'origin': 'https://of.apr.io',
                'referer': 'https://of.apr.io',
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching wallet status:', error);
        throw error;
    }
};

export const updatePoints = async (token) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/users/update-my-points`, {}, {
            headers: {
                'accept': '*/*',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json',
                'dnt': '1',
                'origin': 'https://of.apr.io',
                'referer': 'https://of.apr.io',
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error updating points:', error);
        throw error;
    }
};

export const collectWalletData = async (walletAddress, token) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/quests/status/${walletAddress}`, {
            headers: {
                'accept': '*/*',
                'authorization': `Bearer ${token}`,
                'dnt': '1',
                'origin': 'https://of.apr.io',
                'referer': 'https://of.apr.io',
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error collecting wallet data:', error);
        throw error;
    }
};

export const getWalletActivity = async (walletAddress) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/wallets/${walletAddress}/activity`, {
            headers: {
                'accept': '*/*',
                'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'dnt': '1',
                'origin': 'https://of.apr.io',
                'referer': 'https://of.apr.io',
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching wallet activity:', error);
        throw error;
    }
};

export async function checkWalletStatus(walletAddress) {
    // Contoh: hanya log dan return dummy
    console.log('Checking wallet status for:', walletAddress);
    return { status: 'ok' };
}

export const checkIn = async ({ walletAddress, transactionHash, chainId, token }) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/wallets/checkin`, {
            walletAddress,
            transactionHash,
            chainId
        }, {
            headers: {
                'accept': '*/*',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json',
                'dnt': '1',
                'origin': 'https://of.apr.io',
                'referer': 'https://of.apr.io',
            }
        });
        return response.data;
    } catch (error) {
        if (error.response && error.response.data) {
            throw new Error(error.response.data.message || 'Check-in failed');
        }
        throw error;
    }
};
