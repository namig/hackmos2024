import { Far } from '@agoric/marshal';
import { AmountMath } from '@agoric/ertp';
import { makeVStorage } from '@agoric/vStorage';
import { E } from '@agoric/eventual-send';
import '@agoric/zoe/exported';

/**
 * Create the borrowing contract
 */
const start = async (zcf) => {
  const {
    eth: ethMint,
    usdc: usdcMint,
    timer,
  } = zcf.getTerms();

  // Get brands
  const ethBrand = await E(ethMint).getBrand();
  const usdcBrand = await E(usdcMint).getBrand();

  // Setup VStorage for loan requests
  const loanRequestsStorage = makeVStorage('loanRequests');

  // Store active loans
  const loans = new Map();

  /**
   * Create invitation for locking ETH
   */
  const makeLockETHInvitation = () => {
    const lockETH = async (seat) => {
      const {
        give: { Collateral: ethAmount },
        want: { USDC: usdcAmount },
      } = seat.getProposal();

      // Generate loan ID
      const loanId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store loan request
      const loanRequest = {
        loanId,
        status: 'PENDING',
        ethAmount,
        usdcAmount,
        timestamp: await E(timer).getCurrentTimestamp(),
      };

      await E(loanRequestsStorage).set(loanId, loanRequest);

      // Store loan details
      loans.set(loanId, {
        ethSeat: seat,
        ethAmount,
        usdcAmount,
        status: 'PENDING'
      });

      // Return loanId to user
      seat.exit();
      return loanId;
    };

    return zcf.makeInvitation(lockETH, 'lockETH');
  };

  /**
   * Create invitation for solver to fulfill loan
   */
  const makeFulfillLoanInvitation = (loanId) => {
    const fulfillLoan = async (seat) => {
      const loan = loans.get(loanId);
      if (!loan || loan.status !== 'PENDING') {
        throw new Error('Invalid loan or status');
      }

      const { want: { USDC: usdcAmount } } = seat.getProposal();

      // Verify USDC amount matches loan request
      if (!AmountMath.isEqual(usdcAmount, loan.usdcAmount)) {
        throw new Error('USDC amount mismatch');
      }

      // Transfer ETH to solver
      seat.transfer(loan.ethSeat, { Collateral: loan.ethAmount });

      // Update loan status
      loan.status = 'FULFILLED';
      loans.set(loanId, loan);

      // Update VStorage
      const loanRequest = await E(loanRequestsStorage).get(loanId);
      loanRequest.status = 'FULFILLED';
      await E(loanRequestsStorage).set(loanId, loanRequest);

      seat.exit();
      return 'Loan fulfilled';
    };

    return zcf.makeInvitation(fulfillLoan, 'fulfillLoan');
  };

  /**
   * Check loan status
   */
  const getLoanStatus = (loanId) => {
    const loan = loans.get(loanId);
    return loan ? loan.status : 'NOT_FOUND';
  };

  // Create the public facing API
  const creatorFacet = Far('CreatorFacet', {
    makeLockETHInvitation,
    makeFulfillLoanInvitation,
    getLoanStatus,
  });

  const publicFacet = Far('PublicFacet', {
    makeLockETHInvitation,
    getLoanStatus,
  });

  return { creatorFacet, publicFacet };
};

/**
 * Client-side code for interacting with the contract
 */
const makeClientCode = () => {
  /**
   * Lock ETH and request USDC loan
   */
  const lockETHAndRequestLoan = async ({
                                         ethLockContract,
                                         ethPayment,
                                         usdcAmount,
                                         osmosisAddress,
                                       }) => {
    // Create proposal
    const proposal = {
      give: { Collateral: ethPayment },
      want: { USDC: usdcAmount },
      exit: { onDemand: null },
    };

    // Get invitation
    const invitation = await E(ethLockContract.publicFacet).makeLockETHInvitation();

    // Create offer config
    const offerConfig = {
      invitation,
      proposal,
      payment: { Collateral: ethPayment },
    };

    // Encode the offer
    const { encodedTx } = await E(ethLockContract).makeOfferAndEncode(offerConfig);

    // Execute the encoded transaction
    const result = await executeEncodedTransaction({
      chainId: 'agoricdev-11',
      rpcEndpoint: 'http://localhost:26657',
      walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
      encodedTx,
    });

    return result;
  };

  /**
   * Solver fulfills loan request
   */
  const fulfillLoanRequest = async ({
                                      ethLockContract,
                                      loanId,
                                      usdcPayment,
                                    }) => {
    // Create proposal for fulfilling loan
    const proposal = {
      give: { USDC: usdcPayment },
      want: { Collateral: null }, // ETH amount will be specified by contract
      exit: { onDemand: null },
    };

    // Get fulfill invitation
    const invitation = await E(ethLockContract.creatorFacet)
        .makeFulfillLoanInvitation(loanId);

    // Create offer config
    const offerConfig = {
      invitation,
      proposal,
      payment: { USDC: usdcPayment },
    };

    // Encode the offer
    const { encodedTx } = await E(ethLockContract).makeOfferAndEncode(offerConfig);

    // Execute the encoded transaction
    const result = await executeEncodedTransaction({
      chainId: 'agoricdev-11',
      rpcEndpoint: 'http://localhost:26657',
      walletPrivateKey: process.env.SOLVER_PRIVATE_KEY,
      encodedTx,
    });

    return result;
  };

  return { lockETHAndRequestLoan, fulfillLoanRequest };
};

export { start, makeClientCode };