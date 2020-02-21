pragma solidity ^0.5.15;
import "./SafeMath.sol";

// Governance interface
contract GovernanceInterface {
    function budgetProposalFee() public returns (uint256);
    function canVoteOnBudget(address votingAddress) public returns (bool);
    function ping() public;
    function governorCount() public returns (uint16);
}

contract Budget {
    // imports
    using SafeMath for uint256;

    // address of the governance contract
    address private _governanceAddress;

    // Data structures
    enum Vote {NEW, ABSTAIN, NO, YES}
    struct BudgetProposal {
        uint256 id;
        address owner;
        string title;
        string desc;
        string url;
        uint256 requested;
        uint16 duration;
        uint16 durationsPaid;
        mapping(address => Vote) votes;
        uint16 yesVote;
        uint16 noVote;
    }
    // List of existing proposals
    BudgetProposal[] public proposals;
    // used so each proposal can be identified for voting
    uint256 _poposalCount = 0;

    // Event that will be emitted whenever a new proposal is started
    event ProposalStarted(
        uint256 id,
        address owner,
        string title,
        string desc,
        string url,
        uint256 requested,
        uint16 duration
    );

    // budget block details
    uint256 _budgetStartBlock = 10;
    uint256 _budgetPeriod = 29219;
    uint256 _budgetNextSettlementBlock = _budgetStartBlock.add(_budgetPeriod);

    constructor(address governanceAddress) public {
        _governanceAddress = governanceAddress;
    }

    /** @dev Function to start a new proposal.
      * @param title Title of the proposal to be created
      * @param description Brief description about the proposal
      * @param url Url for the project
      * @param requested Amount being requested in satoshis
      * @param duration Duration of the payments in months
      */
    function startProposal(
        string title,
        string description,
        string url,
        uint256 requested,
        uint16 duration
    ) public payable {
        GovernanceInterface governance = GovernanceInterface(
            _governanceAddress
        );
        uint256 listingFee = governance.budgetProposalFee();
        // must pay listing fee
        require(msg.value == listingFee, "Buget listing fee is required");
        // create new proposal
        _poposalCount++;
        BudgetProposal memory newProp;
        newProp.id = _poposalCount;
        newProp.owner = msg.sender;
        newProp.title = title;
        newProp.desc = description;
        newProp.url = url;
        newProp.requested = requested;
        newProp.duration = duration;
        newProp.yesVote = 0;
        newProp.noVote = 0;
        proposals.push(newProp);
        emit ProposalStarted(
            _poposalCount,
            msg.sender,
            title,
            description,
            url,
            requested,
            duration
        );
    }

    /** @dev Function to vote on a proposal.
      * @param proposalId Id of the proposal being voted on
      * @param vote the vote being cast (no, yes, abstain)
      */
    function voteForProposal(uint256 proposalId, Vote vote) public {
        GovernanceInterface governance = GovernanceInterface(
            _governanceAddress
        );
        // must be a valid governor
        require(
            governance.canVoteOnBudget(msg.sender),
            "Address is not a valid governor"
        );
        // if vote was changed remove previous
        if (
            proposals[proposalId].votes[msg.sender] == Vote.YES &&
            vote != Vote.YES
        ) {
            proposals[proposalId].yesVote--;
        } else if (
            proposals[proposalId].votes[msg.sender] == Vote.NO &&
            vote != Vote.NO
        ) {
            proposals[proposalId].noVote--;
        }
        // update vote on proposal
        if (vote == Vote.YES) proposals[proposalId].yesVote++;
        if (vote == Vote.NO) proposals[proposalId].noVote++;
        // log vote
        proposals[proposalId].votes[msg.sender] = vote;
        // update governor ping
        governance.ping();
    }

    /** @dev Function to fund contract.
      * These funds are paid in each new block and can also be donated to.
      * Any unused funds will be destroyed
      */
    function fund() public payable {}

    /** @dev Function to return current contract funds.
      */
    function balance() public view returns (uint256) {
        return address(this).balance;
    }

    /** @dev Function to settle current proposals.
      */
    function settleBudget() public {
        // must be done on correct block
        require(
            block.number == _budgetNextSettlementBlock,
            "Buget can only be settled in budget block"
        );

        GovernanceInterface governance = GovernanceInterface(
            _governanceAddress
        );
        uint16 governorCount = governance.governorCount();
        uint16 requiredVote = governorCount / 10;
        uint256 allocated = 0;

        // iterate through all projects
        // failed projects are removed
        // complete projects are removed
        // active projects that are passing are funded
        // active projects that have completed funded are moved to complete for 1 budget cycle
        uint256 i;
        for (i = 0; i < proposals.length; i++) {
            // remove failed proposals
            if (hasVotePassed(proposals[i], requiredVote)) {
                delete proposals[i];
                i--;
                break;
            }
            // allocate any funds for active projects
            if (proposals[i].durationsPaid < proposals[i].duration) {
                bool canFund = address(this).balance >=
                    allocated.add(proposals[i].requested);
                if (canFund) {
                    // fund project
                    allocated = allocated.add(proposals[i].requested);
                    proposals[i].durationsPaid++;
                    address(uint160(proposals[i].owner)).transfer(
                        proposals[i].requested
                    );
                }
            }
            // remove project if complete
            if (proposals[i].durationsPaid >= proposals[i].duration) {
                delete proposals[i];
                i--;
            }
        }

        // destroy any left over funds
        if (address(this).balance > 0) {
            address(uint160(0x0)).transfer(address(this).balance);
        }
    }

    function hasVotePassed(BudgetProposal proposal, uint16 requiredVote)
        private
        pure
        returns (bool)
    {
        // passing vote requires more than 10% yes

        if (proposal.yesVote > proposal.noVote) {
            return (proposal.yesVote - proposal.noVote) > requiredVote;
        }
        return false;
    }
}
