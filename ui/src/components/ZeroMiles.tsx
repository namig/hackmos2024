import React, { useState } from 'react';
import { ArrowRight, Loader2, WalletIcon } from 'lucide-react';

const ETH_USDC_PRICE = 2465; // Example price, in practice would come from an oracle

const BorrowInterface = () => {
  const [walletState, setWalletState] = useState({
    connected: false,
    address: '',
    chainId: '',
    error: null
  });

  const [borrowState, setBorrowState] = useState({
    ethAmount: '',
    usdcAmount: '0',
    status: 'idle', // idle, processing, success, error
    transaction: null,
    error: null
  });

  // Connect Keplr wallet
  const connectKeplr = async () => {
    try {
      setBorrowState(prev => ({ ...prev, status: 'processing' }));

      // Check if Keplr is installed
      if (!window.keplr) {
        throw new Error('Please install Keplr extension');
      }

      // Request connection to Osmosis chain
      await window.keplr.enable('osmosis-1');

      const offlineSigner = window.keplr.getOfflineSigner('osmosis-1');
      const accounts = await offlineSigner.getAccounts();

      setWalletState({
        connected: true,
        address: accounts[0].address,
        chainId: 'osmosis-1',
        error: null
      });

      setBorrowState(prev => ({ ...prev, status: 'idle' }));
    } catch (error) {
      setWalletState(prev => ({
        ...prev,
        error: error.message || 'Failed to connect wallet'
      }));
      setBorrowState(prev => ({ ...prev, status: 'error' }));
    }
  };

  // Calculate USDC amount based on ETH input
  const handleEthAmountChange = (e) => {
    const ethAmount = e.target.value;
    const usdcAmount = ethAmount ? (parseFloat(ethAmount) * ETH_USDC_PRICE * 0.7).toFixed(2) : '0';

    setBorrowState(prev => ({
      ...prev,
      ethAmount,
      usdcAmount
    }));
  };

  // Handle borrow process
  const handleBorrow = async () => {
    if (!borrowState.ethAmount) {
      setBorrowState(prev => ({
        ...prev,
        error: 'Please enter ETH amount'
      }));
      return;
    }

    try {
      setBorrowState(prev => ({ ...prev, status: 'processing' }));

      // 1. Create ICA account and get deposit address
      const response = await fetch('/api/create-ica-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletState.address,
          ethAmount: borrowState.ethAmount
        })
      });

      const { icaAddress, borrowId } = await response.json();

      // 2. Prepare transaction for user to sign
      const tx = {
        chainId: 'osmosis-1',
        msgs: [{
          typeUrl: '/cosmos.bank.v1beta1.MsgSend',
          value: {
            fromAddress: walletState.address,
            toAddress: icaAddress,
            amount: [{
              denom: 'eth',
              amount: (parseFloat(borrowState.ethAmount) * 1e18).toString()
            }]
          }
        }]
      };

      // 3. Request signature from Keplr
      const signResponse = await window.keplr.signDirect(
        walletState.address,
        tx
      );

      // 4. Broadcast transaction
      const result = await fetch('/api/broadcast-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTx: signResponse,
          borrowId
        })
      });

      setBorrowState(prev => ({
        ...prev,
        status: 'success',
        transaction: result.txHash
      }));

    } catch (error) {
      setBorrowState(prev => ({
        ...prev,
        status: 'error',
        error: error.message || 'Failed to process borrow request'
      }));
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-xl shadow-lg">
      {/* Wallet Connection */}
      {!walletState.connected ? (
        <button
          onClick={connectKeplr}
          className="w-full mb-6 flex items-center justify-center gap-2 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          disabled={borrowState.status === 'processing'}
        >
          <WalletIcon className="w-5 h-5" />
          Connect Keplr Wallet
        </button>
      ) : (
        <div className="mb-6 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Connected:</span>
            <span
              className="text-sm font-mono">{`${walletState.address.slice(0, 6)}...${walletState.address.slice(-4)}`}</span>
          </div>
        </div>
      )}

      {/* Borrow Form */}
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-center">Borrow USDC using ETH</h1>

        {/* ETH Input */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Deposit ETH
          </label>
          <input
            type="number"
            value={borrowState.ethAmount}
            onChange={handleEthAmountChange}
            placeholder="0.0"
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            disabled={!walletState.connected || borrowState.status === 'processing'}
          />
        </div>

        {/* USDC Output */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Receive USDC
          </label>
          <input
            type="text"
            value={borrowState.usdcAmount}
            readOnly
            className="w-full p-2 bg-gray-50 border rounded-lg"
          />
        </div>

        {/* Borrow Button */}
        <button
          onClick={handleBorrow}
          disabled={!walletState.connected && borrowState.status === 'processing' && !borrowState.ethAmount}
          className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400"
        >
          {borrowState.status === 'processing' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <ArrowRight className="w-5 h-5" />
              Borrow USDC
            </>
          )}
        </button>

        {/* Status Messages */}
        {borrowState.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {borrowState.error}
          </div>
        )}

        {borrowState.status === 'success' && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm">
            Transaction successful! Your USDC will arrive shortly.
          </div>
        )}
      </div>
    </div>
  );
};

export default BorrowInterface;