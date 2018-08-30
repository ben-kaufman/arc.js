import { BigNumber } from "bignumber.js";
import { Address, Hash } from "../commonTypes";
import { ContractWrapperBase } from "../contractWrapperBase";
import { ContractWrapperFactory } from "../contractWrapperFactory";
import {
  ArcTransactionProposalResult,
  ArcTransactionResult,
  DecodedLogEntryEvent,
  IContractWrapperFactory
} from "../iContractWrapperBase";
import { TxGeneratingFunctionOptions } from "../transactionService";
import { Utils } from "../utils";
import { EventFetcherFactory, Web3EventService } from "../web3EventService";
import {
  CancelProposalEventResult,
  CancelVotingEventResult,
  ExecuteProposalEventResult,
  GetAllowedRangeOfChoicesResult,
  IIntVoteInterface,
  NewProposalEventResult,
  OwnerVoteOptions,
  ProposalIdOption,
  ProposeOptions,
  VoteOptions,
  VoteProposalEventResult,
  VoteStatusOptions,
  VoteWithSpecifiedAmountsOptions
} from "./iIntVoteInterface";

/**
 * Provides the services of any voting machine that implements the `IntVoteInterface`
 * Arc contract interface.  Also serves as the base class for all the specific
 * voting machine contract wrapper classes.
 */
export class IntVoteInterfaceWrapper extends ContractWrapperBase implements IIntVoteInterface {

  public factory: IContractWrapperFactory<any> = IntVoteInterfaceFactory;
  public name: string = "IntVoteInterface";
  public friendlyName: string = "IntVoteInterface";

  /**
   * Get or watch events fired on the creation of a new proposal.
   */
  public NewProposal: EventFetcherFactory<NewProposalEventResult>;
  /**
   * Get or watch events fired when a vote is cancelled.
   * Note you won't get this from GenesisProtocol whose proposals and votes are not cancellable
   */
  public CancelProposal: EventFetcherFactory<CancelProposalEventResult>;
  /**
   * Get or watch events fired when proposals have been executed
   */
  public ExecuteProposal: EventFetcherFactory<ExecuteProposalEventResult>;
  /**
   * Get or watch events fired whenever votes are cast on a proposal
   */
  public VoteProposal: EventFetcherFactory<VoteProposalEventResult>;
  /**
   * Get or watch events fired when a voter's vote is cancelled.
   * Note you won't get this from GenesisProtocol whose proposals and votes are not cancellable
   */
  public CancelVoting: EventFetcherFactory<CancelVotingEventResult>;

  /**
   * Get or watch NewProposal events, filtering out proposals that are no longer votable.
   */
  public get VotableProposals(): EventFetcherFactory<NewProposalEventResult> {
    return this.web3EventService.createEventFetcherFactory<NewProposalEventResult>(this.contract.NewProposal,
      (error: Error, log: Array<DecodedLogEntryEvent<NewProposalEventResult>>) => {
        if (!error) {
          log = log.filter(async (event: DecodedLogEntryEvent<NewProposalEventResult>) => {
            const proposalId = event.args._proposalId;
            return await this.isVotable({ proposalId });
          });
        }
        return { error, log };
      });
  }
  /**
   * Register a new proposal with the given parameters. Every proposal is given a unique ID
   * which is a hash generated by calculating the keccak256 of a packing of an
   * incremented counter and the address of the voting machine.
   * @param options
   */
  public async propose(options: ProposeOptions & TxGeneratingFunctionOptions): Promise<ArcTransactionProposalResult> {

    if (!options.avatarAddress) {
      throw new Error(`avatar is not defined`);
    }

    if (!options.executable) {
      throw new Error(`executatable is not defined`);
    }

    const numChoiceBounds = await this.getAllowedRangeOfChoices();

    if (!Number.isInteger(options.numOfChoices)) {
      throw new Error(`numOfChoices must be a number`);
    }

    if (options.numOfChoices < numChoiceBounds.minVote) {
      throw new Error(`numOfChoices cannot be less than ${numChoiceBounds.minVote}`);
    }

    if (options.numOfChoices > numChoiceBounds.maxVote) {
      throw new Error(`numOfChoices cannot be greater than ${numChoiceBounds.maxVote}`);
    }

    if (!options.proposalParameters) {
      options.proposalParameters = Utils.NULL_HASH;
    }

    if (!options.proposerAddress) {
      options.proposerAddress = Utils.NULL_ADDRESS;
    }

    this.logContractFunctionCall("IntVoteInterface.propose", options);

    const txResult = await this.wrapTransactionInvocation("IntVoteInterface.propose",
      options,
      this.contract.propose,
      [options.numOfChoices,
      options.proposalParameters,
      options.avatarAddress,
      options.executable,
      options.proposerAddress]
    );

    return new ArcTransactionProposalResult(txResult.tx, this.contract, this);
  }

  /**
   * Cancel the given proposal
   * @param options
   */
  public async cancelProposal(options: ProposalIdOption & TxGeneratingFunctionOptions): Promise<ArcTransactionResult> {
    if (!options.proposalId) {
      throw new Error(`proposalId is not defined`);
    }

    this.logContractFunctionCall("IntVoteInterface.cancelProposal", options);

    return this.wrapTransactionInvocation("IntVoteInterface.cancelProposal",
      options,
      this.contract.cancelProposal,
      [options.proposalId]
    );
  }

  /**
   * Vote on behalf of the owner of the proposal, ie the agent that created it.
   * @param options
   */
  public async ownerVote(options: OwnerVoteOptions & TxGeneratingFunctionOptions): Promise<ArcTransactionResult> {
    if (!options.proposalId) {
      throw new Error(`proposalId is not defined`);
    }
    await this._validateVote(options.vote, options.proposalId);
    if (!options.voterAddress) {
      throw new Error(`voterAddress is not defined`);
    }

    this.logContractFunctionCall("IntVoteInterface.ownerVote", options);

    return this.wrapTransactionInvocation("IntVoteInterface.ownerVote",
      options,
      this.contract.ownerVote,
      [options.proposalId,
      options.vote,
      options.voterAddress]
    );
  }

  /**
   * Vote on behalf of the current account.
   * @param options
   */
  public async vote(options: VoteOptions & TxGeneratingFunctionOptions): Promise<ArcTransactionResult> {
    if (!options.proposalId) {
      throw new Error(`proposalId is not defined`);
    }
    await this._validateVote(options.vote, options.proposalId);

    this.logContractFunctionCall("IntVoteInterface.vote", options);

    return this.wrapTransactionInvocation("IntVoteInterface.vote",
      options,
      this.contract.vote,
      [options.proposalId, options.vote]
    );
  }

  /**
   * Vote specified reputation amount
   * @param options
   */

  public async voteWithSpecifiedAmounts(
    options: VoteWithSpecifiedAmountsOptions & TxGeneratingFunctionOptions): Promise<ArcTransactionResult> {

    if (!options.proposalId) {
      throw new Error(`proposalId is not defined`);
    }

    await this._validateVote(options.vote, options.proposalId);

    this.logContractFunctionCall("IntVoteInterface.voteWithSpecifiedAmounts", options);

    return this.wrapTransactionInvocation("IntVoteInterface.voteWithSpecifiedAmounts",
      options,
      this.contract.voteWithSpecifiedAmounts,
      [options.proposalId,
      options.vote,
      options.reputation,
      new BigNumber(0)]
    );
  }

  /**
   * Cancel voting on the proposal.
   * @param options
   */
  public async cancelVote(options: ProposalIdOption & TxGeneratingFunctionOptions): Promise<ArcTransactionResult> {
    if (!options.proposalId) {
      throw new Error(`proposalId is not defined`);
    }

    this.logContractFunctionCall("IntVoteInterface.cancelVote", options);

    return this.wrapTransactionInvocation("IntVoteInterface.cancelVote",
      options,
      this.contract.cancelVote,
      [options.proposalId]
    );
  }

  /**
   * Get the number of voting choices allowed by the proposal.
   * @param options
   */
  public async getNumberOfChoices(options: ProposalIdOption): Promise<number> {
    if (!options.proposalId) {
      throw new Error(`proposalId is not defined`);
    }

    this.logContractFunctionCall("IntVoteInterface.getNumberOfChoices", options);

    return (await this.contract.getNumberOfChoices(options.proposalId)).toNumber();
  }

  /**
   * Get whether the proposal is in a state where it can be voted-upon.
   * @param proposalId
   */
  public async isVotable(options: ProposalIdOption): Promise<boolean> {
    if (!options.proposalId) {
      throw new Error(`proposalId is not defined`);
    }

    this.logContractFunctionCall("IntVoteInterface.isVotable", options);

    return await this.contract.isVotable(options.proposalId);
  }

  /**
   * Get the number of votes currently cast on the given choice.
   * @param options
   */
  public async voteStatus(options: VoteStatusOptions): Promise<BigNumber> {
    if (!options.proposalId) {
      throw new Error(`proposalId is not defined`);
    }
    await this._validateVote(options.vote, options.proposalId);

    this.logContractFunctionCall("IntVoteInterface.voteStatus", options);

    return await this.contract.voteStatus(
      options.proposalId,
      options.vote);
  }

  /**
   * get whether voters are allowed to cast an abstaining vote on these proposals.
   */
  public async isAbstainAllow(): Promise<boolean> {

    this.logContractFunctionCall("IntVoteInterface.isAbstainAllow");

    return await this.contract.isAbstainAllow();
  }

  /**
   * Attempt to execute the given proposal vote.
   * @param proposalId
   */

  public async execute(options: ProposalIdOption & TxGeneratingFunctionOptions): Promise<ArcTransactionResult> {
    if (!options.proposalId) {
      throw new Error(`proposalId is not defined`);
    }

    this.logContractFunctionCall("IntVoteInterface.execute", options);

    return this.wrapTransactionInvocation("IntVoteInterface.execute",
      options,
      this.contract.execute,
      [options.proposalId]
    );
  }

  /**
   * Return an array of the current counts of each vote choice on the proposal.
   * For straight Abstain, Yes and No votes you can use the values of the
   * `BinaryVoteResult` enum to dereference the array.  The Abstain vote
   * (in the zeroeth position) is always given even if the voting machine
   * does not allow abstentions.
   *
   * @param proposalId
   */
  public async getCurrentVoteStatus(proposalId: Address): Promise<Array<BigNumber>> {

    let numChoices = await this.getNumberOfChoices({ proposalId });
    const abstainAllowed = await this.isAbstainAllow();
    // when abstaining is not allowed, numChoices doesn't include it, but we always return it here, even if always zero
    if (!abstainAllowed) {
      ++numChoices;
    }

    const voteTotals = new Array<BigNumber>(numChoices);

    for (let choice = 0; choice <= numChoices; ++choice) {
      const voteTotal = await this.voteStatus(
        { vote: choice, proposalId });
      voteTotals[choice] = voteTotal;
    }

    return voteTotals;
  }

  /**
   * Returns promise of the allowed range of choices for a voting machine.
   */
  public async getAllowedRangeOfChoices(): Promise<GetAllowedRangeOfChoicesResult> {
    const result = await this.contract.getAllowedRangeOfChoices();
    return {
      maxVote: result[1].toNumber(),
      minVote: result[0].toNumber(),
    };
  }

  protected hydrated(): void {
    /* tslint:disable:max-line-length */
    this.NewProposal = this.web3EventService.createEventFetcherFactory<NewProposalEventResult>(this.contract.NewProposal);
    this.CancelProposal = this.web3EventService.createEventFetcherFactory<CancelProposalEventResult>(this.contract.CancelProposal);
    this.ExecuteProposal = this.web3EventService.createEventFetcherFactory<ExecuteProposalEventResult>(this.contract.ExecuteProposal);
    this.VoteProposal = this.web3EventService.createEventFetcherFactory<VoteProposalEventResult>(this.contract.VoteProposal);
    this.CancelVoting = this.web3EventService.createEventFetcherFactory<CancelVotingEventResult>(this.contract.CancelVoting);
    /* tslint:enable:max-line-length */
  }

  protected async _validateVote(vote: number, proposalId: Hash): Promise<void> {
    const numChoices = await this.getNumberOfChoices({ proposalId });
    if (!Number.isInteger(vote) || (vote < 0) || (vote > numChoices)) {
      throw new Error("vote choice is not valid");
    }

    if ((typeof vote !== "number") || (vote < 0)) {
      throw new Error(`vote must be a number greater than or equal to zero and less than or equal to ${numChoices}`);
    }
  }
}

export class IntVoteInterfaceFactoryType extends ContractWrapperFactory<IntVoteInterfaceWrapper> {
  public async new(): Promise<IntVoteInterfaceWrapper> {
    throw new Error("`new` is not supported on IntVoteInterface. Only `at` is supported.");
  }
  public async deployed(): Promise<IntVoteInterfaceWrapper> {
    throw new Error("`deployed` is not supported on IntVoteInterface. Only `at` is supported.");
  }
}

export const IntVoteInterfaceFactory =
  new IntVoteInterfaceFactoryType(
    "IntVoteInterface",
    IntVoteInterfaceWrapper,
    new Web3EventService()) as IntVoteInterfaceFactoryType;
