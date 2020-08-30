
const expect = require('chai').expect;
const Big = require('big.js');
const helpers = require('./helpers');

let qtum, mainAddress, mainAddressHex, govContract, dgpContract, newGovernanceBudgetContract;

let governorAddressList = [];
const defaultRequiredCollateral = 10;
const satoshi = 1E8;

// compile and deploy contract before tests
before(async () => {
    let contracts = ['governanceCollateral-dgp.sol', 'DGP.sol', 'Governance.sol']
    await helpers.deploy(contracts);
    qtum = helpers.qtum();
    mainAddress = helpers.mainAddress();
    mainAddressHex = helpers.mainAddressHex();
    govContract = qtum.contract('Governance.sol');
    dgpContract = qtum.contract('DGP.sol');
    await qtum.rawCall("generatetoaddress", [1, mainAddress]);
    await dgpContract.send("dev_setGovernanceAddress", [govContract.address]);
    await qtum.rawCall("generatetoaddress", [1, mainAddress]);
})

describe('Governance.sol', function () {
    it('Should have 0 balance', async function () {
        const result = await govContract.call("balance");
        const balance = result.outputs[0].toNumber();
        expect(balance).to.equal(0);
    });

    it('Should have collateral of 10 MRX', async function () {
        const result = await dgpContract.call("getGovernanceCollateral");
        const collateral = Number(Big(result.outputs[0]).div(satoshi));
        expect(collateral).to.equal(defaultRequiredCollateral);
    });

    it('Should enroll fail to enroll a new governor because no collateral is given', async function () {
        const tx = await govContract.send("enroll", [])
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Collateral is required for enrollment");
    });

    it('Should enroll fail to enroll a new governor because collateral is too low', async function () {
        const tx = await govContract.send("enroll", [], { amount: defaultRequiredCollateral - 1 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("New collateral must be exact");
    });

    it('Should enroll fail to enroll a new governor because collateral is too high', async function () {
        const tx = await govContract.send("enroll", [], { amount: defaultRequiredCollateral - 1 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("New collateral must be exact");
    });

    it('Should still have 0 balance after failed enrollment', async function () {
        const result = await govContract.call("balance");
        const balance = result.outputs[0].toNumber();
        expect(balance).to.equal(0);
    });

    it('Should enroll a new governor', async function () {
        const tx = await govContract.send("enroll", [], { amount: defaultRequiredCollateral, senderAddress: mainAddress })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
    });

    it('Should have 1 governors balance', async function () {
        const result = await govContract.call("balance");
        const balance = Number(Big(result.outputs[0]).div(satoshi));
        expect(balance).to.equal(defaultRequiredCollateral);
    });

    it('Should have 1 governor', async function () {
        const result = await govContract.call("governorCount");
        const count = Number(result.outputs[0]);
        expect(count).to.equal(1);
    });

    it('Should exist in governors list', async function () {
        const result = await govContract.call("governors", [mainAddressHex]);
        let blockHeight = result.outputs[0].toNumber();
        let ping = result.outputs[1].toNumber();
        let collateral = Number(Big(result.outputs[2]).div(satoshi));
        let lastReward = result.outputs[3].toNumber();
        expect(blockHeight).to.exist;
        expect(blockHeight).to.equal(ping);
        expect(collateral).to.equal(defaultRequiredCollateral);
        expect(lastReward).to.equal(0);
    });

    it('Should fail to ping immature governor', async function () {
        let result = await govContract.rawCall("ping", [], { senderAddress: mainAddress });
        expect(result.executionResult.excepted).to.equal("Revert");
        expect(result.executionResult.exceptedMessage).to.equal("Governor is not currently valid");
    });

    it('Should fail to add proposal due to not enough governors', async function () {
        newGovernanceBudgetContract = await helpers.deployCustomContract('governanceCollateral-dgp.sol', [['10E8', '15E8']]);
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        let result = await dgpContract.rawCall("addProposal", [ProposalType.COLLATERAL, newGovernanceBudgetContract.address]);
        expect(result.executionResult.excepted).to.equal("Revert");
        expect(result.executionResult.exceptedMessage).to.equal("Not enough governors to enable voting");
    });

    it('Should fail to get a current winner since no mature governor', async function () {
        const result = await govContract.call("currentWinner")
        const winner = result.outputs[0];
        expect(winner).to.equal("0000000000000000000000000000000000000000");
    });

    it('Should ping valid governor', async function () {
        let result = await govContract.call("governors", [mainAddressHex]);
        let startPing = result.outputs[1].toNumber();
        await qtum.rawCall("generatetoaddress", [10, mainAddress]);
        const tx = await govContract.send("ping", [], { senderAddress: mainAddress });
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        result = await govContract.call("governors", [mainAddressHex]);
        let newPing = result.outputs[1].toNumber();
        expect(startPing).to.be.lessThan(newPing);
    });

    it('Should reward governor and only allow one reward per block', async function () {
        let result = await govContract.call("currentWinner")
        const winner = result.outputs[0];
        expect(winner).to.not.equal("0000000000000000000000000000000000000000");
        const tx1 = await govContract.send("rewardGovernor", [winner], { amount: 1 })
        const tx2 = await govContract.send("rewardGovernor", [winner], { amount: 1 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt1 = await tx1.confirm(1);
        const receipt2 = await tx2.confirm(1);
        let success = receipt1.excepted === "None" ? receipt1 : receipt2;
        let fail = receipt1.excepted === "None" ? receipt2 : receipt1;
        expect(success.excepted).to.equal("None");
        expect(fail.excepted).to.equal("Revert");
        expect(fail.exceptedMessage).to.equal("A Reward has already been paid in this block");
        result = await govContract.call("governors", [mainAddressHex]);
        let lastReward = result.outputs[3].toNumber();
        expect(lastReward).to.be.greaterThan(0);
    });

    it('Should fail to reward invalid governor', async function () {
        const tx = await govContract.send("rewardGovernor", ['0000000000000000000000000000000000000001'], { amount: 1 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Address is not a valid governor");
    });

    it('Should fail to reward a governor too soon', async function () {
        const tx = await govContract.send("rewardGovernor", [mainAddressHex], { amount: 1 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Last reward too recent");
    });

    it('Should remove an inactive governor', async function () {
        await qtum.rawCall("generatetoaddress", [41, mainAddress]);
        const tx = await govContract.send("removeInactiveGovernor")
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        let result = await govContract.call("governors", [mainAddressHex]);
        let blockHeight = result.outputs[0].toNumber();
        let ping = result.outputs[1].toNumber();
        let collateral = Number(Big(result.outputs[2]).div(satoshi));
        let lastReward = result.outputs[3].toNumber();
        let addressIndex = result.outputs[4].toNumber();
        expect(blockHeight).to.equal(0);
        expect(ping).to.equal(0);
        expect(collateral).to.equal(0);
        expect(lastReward).to.equal(0);
        expect(addressIndex).to.equal(0);
    });

    it('Should enroll 2 governors', async function () {
        let tx = await govContract.send("enroll", [], { amount: defaultRequiredCollateral, senderAddress: mainAddress })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        let receipt = await tx.confirm(1);
        const addresses = await qtum.rawCall("listreceivedbyaddress", [0, true]);
        let enrolled = 0;
        let addrIndex = 0;
        while (enrolled < 2) {
            if (addresses[addrIndex].address !== mainAddress) {
                tx = await govContract.send("enroll", [], { amount: defaultRequiredCollateral, senderAddress: addresses[addrIndex].address })
                await qtum.rawCall("generatetoaddress", [1, mainAddress]);
                receipt = await tx.confirm(1);
                expect(receipt.excepted).to.equal("None");
                enrolled++;
                governorAddressList.push(addresses[addrIndex].address)
            }
            addrIndex++
        }
        expect(enrolled).to.equal(2);
        await qtum.rawCall("generatetoaddress", [30, mainAddress]);
    });

    it('Should add proposal to change collateral', async function () {
        await govContract.send("ping", [], { senderAddress: mainAddress });
        await qtum.rawCall("generatetoaddress", [10, mainAddress]);
        let tx = await dgpContract.send("addProposal", [ProposalType.COLLATERAL, newGovernanceBudgetContract.address], { senderAddress: mainAddress });
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        result = await dgpContract.call("proposal");
        const onVote = result.outputs[0];
        const proposalAddress = result.outputs[1];
        const proposalType = Number(result.outputs[3]);
        expect(onVote).to.equal(true);
        expect(proposalAddress).to.equal(newGovernanceBudgetContract.address);
        expect(proposalType).to.equal(ProposalType.COLLATERAL);
    });

    it('Should expire the active proposal', async function () {
        await qtum.rawCall("generatetoaddress", [6, mainAddress]);
        let tx = await dgpContract.send("addProposal", [ProposalType.COLLATERAL, newGovernanceBudgetContract.address], { senderAddress: mainAddress });
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        const result = await dgpContract.call("proposal");
        const onVote = result.outputs[0];
        expect(onVote).to.equal(false);
    });

    it('Should pass proposal to increase collateral', async function () {
        await govContract.send("ping", [], { senderAddress: governorAddressList[0] });
        // create proposal
        let tx = await dgpContract.send("addProposal", [ProposalType.COLLATERAL, newGovernanceBudgetContract.address], { senderAddress: mainAddress });
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        let receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // add another voter
        tx = await dgpContract.send("addProposal", [ProposalType.COLLATERAL, newGovernanceBudgetContract.address], { senderAddress: governorAddressList[0] });
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // get proposal status
        let result = await dgpContract.call("proposal");
        const onVote = result.outputs[0];
        expect(onVote).to.equal(false);
        // get collateral
        result = await dgpContract.call("getGovernanceCollateral");
        const collateral = Number(Big(result.outputs[0]).div(satoshi));
        expect(collateral).to.equal(15);
    });

    it('Should not have any valid governors as collateral has changed', async function () {
        const result = await govContract.call("currentWinner")
        const winner = result.outputs[0];
        expect(winner).to.equal("0000000000000000000000000000000000000000");
    });

    it('Should top up governors collateral', async function () {
        const tx = await govContract.send("enroll", [], { amount: 5, senderAddress: mainAddress })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        const result = await govContract.call("governors", [mainAddressHex]);
        let collateral = Number(Big(result.outputs[2]).div(satoshi));
        expect(collateral).to.equal(15);
    });

    it('Should pass proposal to reduce collateral', async function () {
        // topup another governor for voting
        let tx = await govContract.send("enroll", [], { amount: 5, senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        let receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        // make governors mature
        await qtum.rawCall("generatetoaddress", [10, mainAddress]);
        // create proposal
        tx = await dgpContract.send("addProposal", [ProposalType.COLLATERAL, qtum.contract('governanceCollateral-dgp.sol').address], { senderAddress: mainAddress });
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // add another voter
        tx = await dgpContract.send("addProposal", [ProposalType.COLLATERAL, qtum.contract('governanceCollateral-dgp.sol').address], { senderAddress: governorAddressList[0] });
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // get collateral
        result = await dgpContract.call("getGovernanceCollateral");
        const collateral = Number(Big(result.outputs[0]).div(satoshi));
        expect(collateral).to.equal(defaultRequiredCollateral);
    });

    it('Should reduce governors collateral', async function () {
        const tx = await govContract.send("unenroll", [false], { senderAddress: mainAddress })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        const result = await govContract.call("governors", [mainAddressHex]);
        let collateral = Number(Big(result.outputs[2]).div(satoshi));
        expect(collateral).to.equal(defaultRequiredCollateral);
    });

    it('Should unenroll governor', async function () {
        const tx = await govContract.send("unenroll", [true], { senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        const hexAddress = await qtum.rawCall("gethexaddress", [governorAddressList[0]]);
        const result = await govContract.call("governors", [hexAddress]);
        let blockHeight = result.outputs[0].toNumber();
        let ping = result.outputs[1].toNumber();
        let collateral = result.outputs[1].toNumber();
        let lastReward = result.outputs[3].toNumber();
        let addressIndex = result.outputs[4].toNumber();
        expect(blockHeight).to.equal(0);
        expect(ping).to.equal(0);
        expect(collateral).to.equal(0);
        expect(lastReward).to.equal(0);
        expect(addressIndex).to.equal(0);
    });

});

const ProposalType = {
    NONE: 0,
    GASSCHEDULE: 1,
    BLOCKSIZE: 2,
    MINGASPRICE: 3,
    BLOCKGASLIMIT: 4,
    TRANSACTIONFEERATES: 5,
    COLLATERAL: 6,
    BUDGETFEE: 7
}