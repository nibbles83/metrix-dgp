pragma solidity ^0.6.1;
import "./imports/SafeMath.sol";

contract Governance {
    // imports
    using SafeMath for uint256;

    // events
    event NewCollateralProposal(uint256 amount); // Emitted when a new proposal to change the collateral is made
    event CollateralProposalPassed(uint256 amount); // Emitted when a new proposal to change the collateral is passed

    // governors
    struct Governor {
        uint256 blockHeight;
        uint256 collateral;
        uint256 lastReward;
        uint256 addressIndex;
    }

    uint256 private _governorCount = 0;
    uint256 private _maximumGovernors = 2000;
    uint256 public _requiredCollateral = 10 ether;
    uint256 private _blocksBeforeUnenroll = 10;
    uint256 private _blockBeforeMatureGovernor = 10;
    mapping(address => Governor) public governors;
    address[] governorAddresses;

    // collateral adjustment
    struct CollateralProposal {
        bool onVote;
        address[] votes;
        uint256 proposal;
        uint256 proposalHeight;
    }
    uint256 private _proposalExpiryBlocks = 5;
    CollateralProposal public collateralProposal;

    // rewards
    uint256 private _rewardBlockInterval = 10;
    uint256 private _reward = 1 ether;

    // ------------------------------
    // ----- GOVERNANCE SYSTEM ------
    // ------------------------------

    // get total governor funds
    function balance() public view returns (uint256) {
        return address(this).balance;
    }

    // enroll an address to be a governor
    // new addresses must supply the exact collateral in one transaction
    // if the required collateral has increased allow addresses to top up
    function enroll() public payable {
        // must send an amount
        require(msg.value > 0, "Collateral is required for enrollment");
        // check if new enrollment or topup
        if (governors[msg.sender].blockHeight > 0) {
            // address is already a governor. If the collateral has increase, allow a topup
            uint256 newCollateral = governors[msg.sender].collateral.add(
                msg.value
            );
            require(
                newCollateral == _requiredCollateral,
                "Topup collateral must be exact"
            );
            governors[msg.sender].collateral = _requiredCollateral;
            governors[msg.sender].blockHeight = block.number;
            governors[msg.sender].lastReward = 0;
        } else {
            // address is a not already a governor. collateral must be exact
            require(
                msg.value == _requiredCollateral,
                "new collateral must be exact"
            );
            // add governor
            governors[msg.sender] = Governor({
                collateral: _requiredCollateral,
                blockHeight: block.number,
                lastReward: 0,
                addressIndex: _governorCount
            });
            _governorCount++;
            governorAddresses.push(msg.sender);
        }
    }

    // unenroll as a governor
    // this will refund the addresses collateral
    function unenroll(bool force) public returns (bool) {
        // check if a governor
        require(
            governors[msg.sender].blockHeight > 0,
            "Must be a governor to unenroll"
        );
        // check blocks have passed to make a change
        uint256 enrolledAt = governors[msg.sender].blockHeight +
            _blocksBeforeUnenroll;
        require(block.number > enrolledAt, "Too early to unenroll");
        if (!force && governors[msg.sender].collateral > _requiredCollateral) {
            // if the required collateral has changed allow it to be reduce without unenrolling
            uint256 refund = governors[msg.sender].collateral.sub(
                _requiredCollateral
            );
            // safety check balance
            require(
                address(this).balance >= refund,
                "Contract does not contain enough funds"
            );
            // update governor
            governors[msg.sender].collateral = _requiredCollateral;
            governors[msg.sender].blockHeight = block.number;
            // send refund
            (bool success, ) = msg.sender.call.value(refund)("");
            if (!success) {
                governors[msg.sender].collateral = governors[msg.sender]
                    .collateral
                    .add(refund);
                return false;
            } else {
                governors[msg.sender].lastReward = 0;
                return true;
            }
        } else {
            // unenroll the governor
            uint256 refund = governors[msg.sender].collateral;
            uint256 addressIndex = governors[msg.sender].addressIndex;
            // safety check balance
            require(
                address(this).balance >= refund,
                "Contract does not contain enough funds"
            );
            // remove governor
            delete governors[msg.sender];
            _governorCount--;
            delete governorAddresses[addressIndex];
            // refund
            (bool success, ) = msg.sender.call.value(refund)("");
            if (!success) {
                governors[msg.sender] = Governor({
                    collateral: refund,
                    blockHeight: block.number,
                    lastReward: 0,
                    addressIndex: _governorCount
                });
                _governorCount++;
                governorAddresses.push(msg.sender);
                return false;
            } else {
                return true;
            }
        }
    }

    // returns true if a governor exists, is mature and has the correct collateral
    function isValidGovernor(address governorAddress)
        private
        view
        returns (bool valid)
    {
        // must be a mature governor
        if (
            block.number - governors[governorAddress].blockHeight <
            _blockBeforeMatureGovernor
        ) {
            return false;
        }
        // must have the right collateral
        if (governors[governorAddress].collateral != _requiredCollateral) {
            return false;
        }
        return true;
    }

    // ------------------------------
    // ------ COLLATERAL VOTING -----
    // ------------------------------

    // add new proposal or vote on existing proposal to change the governor collateral
    function addCollateralProposal(uint256 newCollateral) public {
        // address must be governor
        require(
            isValidGovernor(msg.sender),
            "Only valid governors can create proposals"
        );
        // check a vote isn't active
        if (!collateralProposal.onVote) {
            collateralProposal.onVote = true; // put proposal on vote, no changes until vote is setteled or removed
            collateralProposal.proposal = newCollateral.mul(1 ether); // set new proposal for vote
            collateralProposal.proposalHeight = block.number; // set new proposal initial height
            collateralProposal.votes.length = 0; // clear votes
            collateralProposal.votes.push(msg.sender); // add sender vote
            emit NewCollateralProposal(newCollateral.mul(1 ether)); // alert listeners
        } else if (collateralProposal.proposal == newCollateral) {
            require(!alreadyVoted(), "Governor has already voted"); // cannot vote twice
            collateralProposal.votes.push(msg.sender); // add sender vote
        }
        // check if vote has expired
        if (
            block.number - collateralProposal.proposalHeight >
            _proposalExpiryBlocks
        ) {
            clearCollateralProposal();
        } else {
            // check if vote has passed a simple majority (51%)
            if (collateralProposal.votes.length >= (_governorCount / 2 + 1)) {
                // update collateral
                _requiredCollateral = newCollateral.mul(1 ether);
                // clear proposal
                clearCollateralProposal();
                emit CollateralProposalPassed(_requiredCollateral); // alert listeners
            }
        }
    }

    function clearCollateralProposal() private {
        collateralProposal.proposal = 0; // clear current proposal address
        collateralProposal.votes.length = 0; // clear votes
        collateralProposal.proposalHeight = 0; // clear proposal height
        collateralProposal.onVote = false; // open submission
    }

    function alreadyVoted() private view returns (bool voted) {
        uint256 i;
        for (i = 0; i < collateralProposal.votes.length; i++) {
            if (collateralProposal.votes[i] == msg.sender) return true;
        }
        return false;
    }

    // ------------------------------
    // -------- REWARD SYSTEM -------
    // ------------------------------

    function rewardGovernor() public payable returns (bool) {
        // amount must be the equal to the reward amount
        require(msg.value == _reward, "Rewards must be exact");
        // select a winner
        address winner = selectWinner();
        if (winner == address(0)) {
            return false;
        }
        // pay governor
        uint256 lastReward = governors[winner].lastReward;
        governors[winner].lastReward = block.number;
        (bool success, ) = address(uint160(winner)).call.value(_reward)("");
        if (!success) {
            governors[winner].lastReward = lastReward;
            return false;
        } else {
            return true;
        }
    }

    function selectWinner() private view returns (address winner) {
        uint256 i;
        for (i = 0; i < _governorCount; i++) {
            if (
                isValidGovernor(governorAddresses[i]) &&
                block.number - governors[governorAddresses[i]].lastReward >=
                _rewardBlockInterval
            ) {
                return governorAddresses[i];
            }
        }
        return address(0);
    }
}
