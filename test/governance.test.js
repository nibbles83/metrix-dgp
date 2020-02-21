
const expect = require('chai').expect;
const Big = require('big.js');
const helpers = require('./helpers');

let qtum, mainAddress, mainAddressHex, contract;

let governorAddressList = [];
const defaultRequiredCollateral = 10;
const satoshi = 1E8;
const reward = 1;

// compile and deploy contract before tests
before(async () => {
    await helpers.deploy('Governance.sol');
    qtum = helpers.qtum();
    mainAddress = helpers.mainAddress();
    mainAddressHex = helpers.mainAddressHex();
    contract = helpers.contract();
})

describe('Governance.sol', function () {
    it('Should have 0 balance', async function () {
        const result = await contract.call("balance");
        const balance = result.outputs[0].toNumber();
        expect(balance).to.equal(0);
    });

    it('Should have collateral of 10 MRX', async function () {
        const result = await contract.call("requiredCollateral");
        const collateral = Number(Big(result.outputs[0]).div(satoshi));
        expect(collateral).to.equal(defaultRequiredCollateral);
    });

    it('Should enroll fail to enroll a new governor because no collateral is given', async function () {
        const tx = await contract.send("enroll", [])
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Collateral is required for enrollment");
    });

    it('Should enroll fail to enroll a new governor because collateral is too low', async function () {
        const tx = await contract.send("enroll", [], { amount: defaultRequiredCollateral - 1 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("New collateral must be exact");
    });

    it('Should enroll fail to enroll a new governor because collateral is too high', async function () {
        const tx = await contract.send("enroll", [], { amount: defaultRequiredCollateral - 1 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("New collateral must be exact");
    });

    it('Should still have 0 balance after failed enrollment', async function () {
        const result = await contract.call("balance");
        const balance = result.outputs[0].toNumber();
        expect(balance).to.equal(0);
    });

    it('Should enroll a new governor', async function () {
        const tx = await contract.send("enroll", [], { amount: defaultRequiredCollateral })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
    });

    it('Should have 1 governors balance', async function () {
        const result = await contract.call("balance");
        const balance = Number(Big(result.outputs[0]).div(satoshi));
        expect(balance).to.equal(defaultRequiredCollateral);
    });

    it('Should have 1 governor', async function () {
        const result = await contract.call("governorCount");
        const count = Number(result.outputs[0]);
        expect(count).to.equal(1);
    });

    it('Should exist in governors list', async function () {
        const result = await contract.call("governors", [mainAddressHex]);
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
        let result = await contract.rawCall("ping");
        expect(result.executionResult.excepted).to.equal("Revert");
        expect(result.executionResult.exceptedMessage).to.equal("Governor is not currently valid");
    });

    it('Should fail to add proposal due to not enough governors', async function () {
        let result = await contract.rawCall("addProposal", [1, 15]);
        expect(result.executionResult.excepted).to.equal("Revert");
        expect(result.executionResult.exceptedMessage).to.equal("Not enough governors to enable voting");
    });

    it('Should fail to reward since reward is to high', async function () {
        const tx = await contract.send("rewardGovernor", [], { amount: reward + 1 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Reward is too high");
    });

    it('Should fail to reward since no mature governor', async function () {
        const tx = await contract.send("rewardGovernor", [], { amount: reward })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("No winner could be determined");
    });

    it('Should ping valid governor', async function () {
        let result = await contract.call("governors", [mainAddressHex]);
        let startPing = result.outputs[1].toNumber();
        await qtum.rawCall("generatetoaddress", [10, mainAddress]);
        const tx = await contract.send("ping");
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        result = await contract.call("governors", [mainAddressHex]);
        let newPing = result.outputs[1].toNumber();
        expect(startPing).to.be.lessThan(newPing);
    });

    it('Should reward governor', async function () {
        const tx = await contract.send("rewardGovernor", [], { amount: reward })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        const result = await contract.call("governors", [mainAddressHex]);
        let lastReward = result.outputs[3].toNumber();
        expect(lastReward).to.be.greaterThan(0);
    });

    it('Should remove an inactive governor', async function () {
        await qtum.rawCall("generatetoaddress", [40, mainAddress]);
        const tx = await contract.send("removeInactiveGovernor")
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        let result = await contract.call("governors", [mainAddressHex]);
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
        let tx = await contract.send("enroll", [], { amount: defaultRequiredCollateral })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        let receipt = await tx.confirm(1);
        const addresses = await qtum.rawCall("listreceivedbyaddress");
        let enrolled = 0;
        let addrIndex = 0;
        while (enrolled < 2) {
            if (addresses[addrIndex].address !== mainAddress) {
                tx = await contract.send("enroll", [], { amount: defaultRequiredCollateral, senderAddress: addresses[addrIndex].address })
                await qtum.rawCall("generatetoaddress", [1, mainAddress]);
                receipt = await tx.confirm(1);
                expect(receipt.excepted).to.equal("None");
                enrolled++;
                governorAddressList.push(addresses[addrIndex].address)
            }
            addrIndex++
        }
        expect(enrolled).to.equal(2);
        await qtum.rawCall("generatetoaddress", [10, mainAddress]);
    });

    it('Should add proposal to change collateral', async function () {
        let tx = await contract.send("addProposal", [1, 15 * satoshi]);
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        result = await contract.call("proposal");
        const onVote = result.outputs[0];
        const proposalAmount = Number(Big(result.outputs[1]).div(satoshi));
        const proposalType = Number(result.outputs[3]);
        expect(onVote).to.equal(true);
        expect(proposalAmount).to.equal(15);
        expect(proposalType).to.equal(1);
    });

    it('Should expire the active proposal', async function () {
        await qtum.rawCall("generatetoaddress", [6, mainAddress]);
        let tx = await contract.send("addProposal", [1, 15]);
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1);
        const result = await contract.call("proposal");
        const onVote = result.outputs[0];
        expect(onVote).to.equal(false);
    });

    it('Should pass proposal to increase collateral', async function () {
        // create proposal
        let tx = await contract.send("addProposal", [1, 15 * satoshi]);
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        let receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // check double vote fails
        tx = await contract.send("addProposal", [1, 15 * satoshi]);
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("Governor has already voted");
        // add another voter
        tx = await contract.send("addProposal", [1, 15 * satoshi], { senderAddress: governorAddressList[0] });
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // get proposal statue
        let result = await contract.call("proposal");
        const onVote = result.outputs[0];
        expect(onVote).to.equal(false);
        // get collateral 
        result = await contract.call("requiredCollateral");
        const collateral = Number(Big(result.outputs[0]).div(satoshi));
        expect(collateral).to.equal(15);
    });

    it('Should not have any valid governors as collateral has changed', async function () {
        const tx = await contract.send("rewardGovernor", [], { amount: reward })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("Revert");
        expect(receipt.exceptedMessage).to.equal("No winner could be determined");
    });

    it('Should top up governors collateral', async function () {
        const tx = await contract.send("enroll", [], { amount: 5 })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        const result = await contract.call("governors", [mainAddressHex]);
        let collateral = Number(Big(result.outputs[2]).div(satoshi));
        expect(collateral).to.equal(15);
    });

    it('Should pass proposal to reduce collateral', async function () {
        // topup another governor for voting
        let tx = await contract.send("enroll", [], { amount: 5, senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        let receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        // make governors mature
        await qtum.rawCall("generatetoaddress", [10, mainAddress]);
        // create proposal
        tx = await contract.send("addProposal", [1, defaultRequiredCollateral * satoshi]);
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // add another voter
        tx = await contract.send("addProposal", [1, defaultRequiredCollateral * satoshi], { senderAddress: governorAddressList[0] });
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        receipt = await tx.confirm(1);
        expect(receipt.excepted).to.equal("None");
        // get collateral 
        result = await contract.call("requiredCollateral");
        const collateral = Number(Big(result.outputs[0]).div(satoshi));
        expect(collateral).to.equal(defaultRequiredCollateral);
    });

    it('Should reduce governors collateral', async function () {
        const tx = await contract.send("unenroll", [false])
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        const result = await contract.call("governors", [mainAddressHex]);
        let collateral = Number(Big(result.outputs[2]).div(satoshi));
        expect(collateral).to.equal(defaultRequiredCollateral);
    });

    it('Should unenroll governor', async function () {
        const tx = await contract.send("unenroll", [true], { senderAddress: governorAddressList[0] })
        await qtum.rawCall("generatetoaddress", [1, mainAddress]);
        const receipt = await tx.confirm(1)
        expect(receipt.excepted).to.equal("None");
        const hexAddress = await qtum.rawCall("gethexaddress", [governorAddressList[0]]);
        const result = await contract.call("governors", [hexAddress]);
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
