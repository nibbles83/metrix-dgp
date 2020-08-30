
const expect = require('chai').expect;
const Big = require('big.js');
const helpers = require('./helpers');

let qtum, mainAddress, govContract, budgetContract;

let governorAddressList = [];
const defaultRequiredCollateral = 10;
const budgetFee = 1;
const satoshi = 1E8;

// compile and deploy contract before tests
before(async () => {
    let contracts = ['governanceCollateral-dgp.sol', 'budgetFee-dgp.sol', 'DGP.sol', 'Governance.sol', 'Budget.sol']
    await helpers.deploy(contracts);
    qtum = helpers.qtum();
    mainAddress = helpers.mainAddress();
    govContract = qtum.contract('Governance.sol');
    budgetContract = qtum.contract('Budget.sol');
    // enroll 10 governors
    const addresses = await qtum.rawCall("listreceivedbyaddress", [0, true]);
    for (let i = 0; i < 10; i++) {
        let tx = await govContract.send("enroll", [], { amount: defaultRequiredCollateral, senderAddress: addresses[i].address })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        governorAddressList.push(addresses[i].address)
    }
    await qtum.rawCall("generatetoaddress", [10, mainAddress]);
})

describe('Budget.sol', function () {
    it('Should fail to start a proposal as the fee is not paid', async function () {
        const tx = await budgetContract.send("startProposal", ['title', 'description', 'url', 100, 1], { amount: budgetFee - .1 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Buget listing fee is required");
    });

    it('Should start a proposal', async function () {
        let title = 'proposal title';
        let desc = 'proposal description';
        let url = 'proposal url';
        let amount = 100;
        let duration = 1;
        const tx = await budgetContract.send("startProposal", [title, desc, url, amount, duration], { amount: budgetFee, gasLimit: 500000 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        const result = await budgetContract.call("proposals", [0]);
        expect(result.outputs[2]).to.equal(title);
        expect(result.outputs[3]).to.equal(desc);
        expect(result.outputs[4]).to.equal(url);
        expect(result.outputs[5].toNumber()).to.equal(amount);
        expect(result.outputs[6].toNumber()).to.equal(duration);
        expect(result.outputs[7].toNumber()).to.equal(0);
        expect(result.outputs[8].toNumber()).to.equal(0);
        expect(result.outputs[9].toNumber()).to.equal(0);
    });

    it('Should fail to vote as is not a governor', async function () {
        const address = await qtum.rawCall("getnewaddress");
        const tx = await budgetContract.send("voteForProposal", [1, Vote.ABSTAIN], { senderAddress: address })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Address is not a valid governor");
    });

    it('Should fail to vote as governor is not valid', async function () {
        const tx = await budgetContract.send("voteForProposal", [1, Vote.ABSTAIN], { senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Address is not a valid governor");
    });

    it('Should fail to vote as proposal id does not exist', async function () {
        await govContract.send("ping", [], { senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [30, mainAddress]);
        const tx = await budgetContract.send("voteForProposal", [99, Vote.ABSTAIN], { senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Proposal not found");
    });

    it('Should vote no on proposal', async function () {
        const tx = await budgetContract.send("voteForProposal", [1, Vote.NO], { senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        const vote = await budgetContract.call("proposalVoteStatus", [1], { senderAddress: governorAddressList[0] })
        expect(vote.outputs[0].toNumber()).to.equal(Vote.NO);
        const proposal = await budgetContract.call("proposals", [0]);
        expect(proposal.outputs[8].toNumber()).to.equal(0);
        expect(proposal.outputs[9].toNumber()).to.equal(1);
    });

    it('Should change vote to abstain on proposal', async function () {
        const tx = await budgetContract.send("voteForProposal", [1, Vote.ABSTAIN], { senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        const vote = await budgetContract.call("proposalVoteStatus", [1], { senderAddress: governorAddressList[0] })
        expect(vote.outputs[0].toNumber()).to.equal(Vote.ABSTAIN);
        const proposal = await budgetContract.call("proposals", [0]);        
        expect(proposal.outputs[8].toNumber()).to.equal(0);
        expect(proposal.outputs[9].toNumber()).to.equal(0);
    });

    it('Should change vote to yes on proposal', async function () {
        const tx = await budgetContract.send("voteForProposal", [1, Vote.YES], { senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        const vote = await budgetContract.call("proposalVoteStatus", [1], { senderAddress: governorAddressList[0] })
        expect(vote.outputs[0].toNumber()).to.equal(Vote.YES);
        const proposal = await budgetContract.call("proposals", [0]);
        expect(proposal.outputs[8].toNumber()).to.equal(1);
        expect(proposal.outputs[9].toNumber()).to.equal(0);
    });

    it('Should only allow 1 vote on proposal', async function () {
        const tx = await budgetContract.send("voteForProposal", [1, Vote.YES], { senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        const proposal = await budgetContract.call("proposals", [0]);
        expect(proposal.outputs[8].toNumber()).to.equal(1);
        expect(proposal.outputs[9].toNumber()).to.equal(0);
    });

    it('Should add funds to budget', async function () {
        const tx = await budgetContract.send("fund", [], { amount: 100 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        const result = await budgetContract.call("balance");
        const balance = Number(Big(result.outputs[0]).div(satoshi));
        expect(balance).to.equal(101);
    });

    it('Should remove failed proposal from budget', async function () {
        const tx = await budgetContract.send("settleBudget")
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        const result = await budgetContract.call("getProposalIndex", [1]);
        expect(result.outputs[0].toNumber()).to.equal(-1);
    });

    it('Should have no funds in budget', async function () {
        const result = await budgetContract.call("balance");
        const balance = Number(Big(result.outputs[0]).div(satoshi));
        expect(balance).to.equal(0);
    });

    it('Should pass 2 proposals, fund 1 proposal and remove 1 proposal', async function () {
        await govContract.send("ping", [], { senderAddress: governorAddressList[1] })
        // add 3 proposals
        const tx1 = await budgetContract.send("startProposal", ['t1', 'd1', 'u1', 100E8, 2], { amount: budgetFee, gasLimit: 500000 });
        const tx2 = await budgetContract.send("startProposal", ['t2', 'd2', 'u2', 100E8, 2], { amount: budgetFee, gasLimit: 500000 });
        const tx3 = await budgetContract.send("startProposal", ['t3', 'd3', 'u3', 100E8, 2], { amount: budgetFee, gasLimit: 500000 });
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        let receipts = await Promise.all([tx1.confirm(1), tx2.confirm(1), tx3.confirm(1)]);
        // yes vote on all 3 + no vote on first
        let txs = await Promise.all([
            budgetContract.send("voteForProposal", [2, Vote.YES], { senderAddress: governorAddressList[0] }),
            budgetContract.send("voteForProposal", [3, Vote.YES], { senderAddress: governorAddressList[0] }),
            budgetContract.send("voteForProposal", [4, Vote.YES], { senderAddress: governorAddressList[0] }),
            budgetContract.send("voteForProposal", [2, Vote.YES], { senderAddress: governorAddressList[1] }),
            budgetContract.send("voteForProposal", [3, Vote.YES], { senderAddress: governorAddressList[1] }),
            budgetContract.send("voteForProposal", [4, Vote.NO], { senderAddress: governorAddressList[1] }),
        ])
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        receipts = await Promise.all([txs[0].confirm(1), txs[1].confirm(1), txs[2].confirm(1), txs[3].confirm(1)]);
        // fund budget
        let tx = await budgetContract.send("fund", [], { amount: 100 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        let receipt = await tx.confirm(1);
        // settle
        tx = await budgetContract.send("settleBudget", [])
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        receipt = await tx.confirm(1);
        // check proposals
        const p1 = await budgetContract.call("proposals", [0]);
        const p2 = await budgetContract.call("proposals", [1]);
        const p3 = await budgetContract.call("proposals", [2]);
        expect(p1.outputs[10]).to.equal(false);
        expect(p1.outputs[7].toNumber()).to.equal(1);
        expect(p2.outputs[10]).to.equal(false);
        expect(p2.outputs[7].toNumber()).to.equal(0);
        expect(p3.outputs[10]).to.equal(true);
    });

});

const Vote = { NEW: 0, ABSTAIN: 1, NO: 2, YES: 3 }