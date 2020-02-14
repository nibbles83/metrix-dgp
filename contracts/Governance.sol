pragma solidity ^0.4.26;
import "./SafeMath.sol";

contract Governance {
    // imports
    using SafeMath for uint256;

    // events
    event NewProposal(ProposalType proposalType, uint256 amount); // Emitted when a new proposal is made
    event ProposalPassed(ProposalType proposalType, uint256 amount); // Emitted when a new proposal is passed

    // governors
    struct Governor {
        uint256 blockHeight; // enrollment block height
        uint256 lastPing; // last ping block
        uint256 collateral; // contract held collateral
        uint256 lastReward; // last block governor was rewarded
        uint16 addressIndex; // position in the address index array
    }

    uint16 private _governorCount = 0;
    uint16 private _maximumGovernors = 2000;
    uint256 private _requiredCollateral = 10E8;
    uint16 private _blocksBeforeUnenroll = 10;
    uint16 private _blockBeforeMatureGovernor = 10;
    mapping(address => Governor) public governors;
    address[] governorAddresses;

    // proposals
    enum ProposalType {NONE, COLLATERAL, BUDGETFEE}
    struct Proposal {
        bool onVote;
        address[] votes;
        uint256 proposalAmount;
        uint256 proposalHeight;
        ProposalType proposalType;
    }
    uint16 private _proposalExpiryBlocks = 5;
    Proposal public proposal;

    // budget
    uint256 private _budgetProposalFee = 1E8;

    // rewards
    uint16 private _rewardBlockInterval = 10;
    uint256 private _reward = 1E8;

    // ------------------------------
    // ----- GOVERNANCE SYSTEM ------
    // ------------------------------

    // get total governor funds
    function balance() public view returns (uint256) {
        return address(this).balance;
    }

    // get required governor collateral
    function requiredCollateral() public view returns (uint256) {
        return _requiredCollateral;
    }

    // get total number of governors
    function governorCount() public view returns (uint16) {
        return _governorCount;
    }

    function ping() public {
        // check if a governor
        require(
            governors[msg.sender].blockHeight > 0,
            "Must be a governor to unenroll"
        );
        // check if governor is valid
        require(isValidGovernor(msg.sender), "Governor is not currenlty valid");
        // update ping
        governors[msg.sender].lastPing = block.number;
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
            governors[msg.sender].lastPing = block.number;
            governors[msg.sender].lastReward = 0;
        } else {
            // haven't reached maximum governors
            require(
                _governorCount < _maximumGovernors,
                "The maximum number of governors has been reached"
            );
            // address is a not already a governor. collateral must be exact
            require(
                msg.value == _requiredCollateral,
                "New collateral must be exact"
            );
            // add governor
            governors[msg.sender] = Governor({
                collateral: _requiredCollateral,
                blockHeight: block.number,
                lastPing: block.number,
                lastReward: 0,
                addressIndex: _governorCount
            });
            _governorCount++;
            governorAddresses.push(msg.sender);
        }
    }

    // unenroll as a governor
    // this will refund the addresses collateral
    function unenroll(bool force) public {
        // check if a governor
        require(
            governors[msg.sender].blockHeight > 0,
            "Must be a governor to unenroll"
        );
        // check blocks have passed to make a change
        uint256 enrolledAt = governors[msg.sender].blockHeight +
            _blocksBeforeUnenroll;
        require(block.number > enrolledAt, "Too early to unenroll");
        uint256 refund = 0;
        if (!force && governors[msg.sender].collateral > _requiredCollateral) {
            // if the required collateral has changed allow it to be reduce without unenrolling
            refund = governors[msg.sender].collateral.sub(_requiredCollateral);
            // safety check balance
            require(
                address(this).balance >= refund,
                "Contract does not contain enough funds"
            );
            // update governor
            governors[msg.sender].collateral = _requiredCollateral;
            governors[msg.sender].blockHeight = block.number;
            governors[msg.sender].lastPing = block.number;
            // send refund
            msg.sender.transfer(refund);
            // rest last reward
            governors[msg.sender].lastReward = 0;
        } else {
            // unenroll the governor
            refund = governors[msg.sender].collateral;
            uint16 addressIndex = governors[msg.sender].addressIndex;
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
            msg.sender.transfer(refund);
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
    // ------- PROPOSAL VOTING ------
    // ------------------------------

    // add new proposal or vote on existing proposal to change the governor collateral
    function addProposal(ProposalType proposalType, uint256 proposalAmount)
        public
    {
        // address must be governor
        require(
            isValidGovernor(msg.sender),
            "Only valid governors can create proposals"
        );
        // check a vote isn't active
        if (!proposal.onVote) {
            proposal.onVote = true; // put proposal on vote, no changes until vote is setteled or removed
            proposal.proposalAmount = proposalAmount; // set new proposal for vote
            proposal.proposalType = proposalType; // set type of proposal vote
            proposal.proposalHeight = block.number; // set new proposal initial height
            delete proposal.votes; // clear votes
            proposal.votes.push(msg.sender); // add sender vote
            emit NewProposal(proposalType, proposalAmount); // alert listeners
        } else if (
            proposal.proposalAmount == proposalAmount &&
            proposal.proposalType == proposalType
        ) {
            require(!alreadyVoted(), "Governor has already voted"); // cannot vote twice
            proposal.votes.push(msg.sender); // add sender vote
        }
        // check if vote has expired
        if (block.number - proposal.proposalHeight > _proposalExpiryBlocks) {
            clearCollateralProposal();
        } else {
            // check if vote has passed a simple majority (51%)
            if (proposal.votes.length >= (_governorCount / 2 + 1)) {
                if (proposal.proposalType == ProposalType.COLLATERAL) {
                    // update collateral
                    _requiredCollateral = proposal.proposalAmount;
                } else if (proposal.proposalType == ProposalType.BUDGETFEE) {
                    // update budget listing fee
                    _budgetProposalFee = proposal.proposalAmount;
                }
                // alert listeners
                emit ProposalPassed(
                    proposal.proposalType,
                    proposal.proposalAmount
                );
                // clear proposal
                clearCollateralProposal();
            }
        }
        // update ping time
        governors[msg.sender].lastPing = block.number;
    }

    function clearCollateralProposal() private {
        proposal.proposalAmount = 0; // clear amount
        proposal.proposalType = ProposalType.NONE; // clear amount
        delete proposal.votes; // clear votes
        proposal.proposalHeight = 0; // clear proposal height
        proposal.onVote = false; // open submission
    }

    function alreadyVoted() private view returns (bool voted) {
        uint16 i;
        for (i = 0; i < proposal.votes.length; i++) {
            if (proposal.votes[i] == msg.sender) return true;
        }
        return false;
    }

    // ------------------------------
    // -------- REWARD SYSTEM -------
    // ------------------------------

    function hasGovernorToReward() public view returns (bool) {
        address winner = selectWinner();
        return winner != address(0);
    }

    function rewardGovernor() public payable {
        // amount must be the equal to the reward amount
        require(msg.value == _reward, "Rewards must be exact");
        // select a winner
        address winner = selectWinner();
        require(winner != address(0), "No winner could be determined");
        // pay governor
        governors[winner].lastReward = block.number;
        address(uint160(winner)).transfer(_reward);
    }

    function selectWinner() private view returns (address winner) {
        uint16 i;
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

    // ------------------------------
    // ----------- BUDGET -----------
    // ------------------------------
    function budgetProposalFee() public view returns (uint256) {
        return _budgetProposalFee;
    }

    function canVoteOnBudget(address votingAddress) public view returns (bool) {
        return isValidGovernor(votingAddress);
    }
}
