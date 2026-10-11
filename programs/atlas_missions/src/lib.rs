use anchor_lang::prelude::*;
use anchor_lang::solana_program::bpf_loader_upgradeable;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("FUjnUmo4QBtEeAEs2n5844zKfAN5sZP2MgbnFTiA3hFQ");

#[program]
pub mod atlas_missions {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        assignment_authority: Pubkey,
        fallback_authority: Pubkey,
        assignment_expires_at: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require_keys_neq!(assignment_authority, fallback_authority, MissionError::AuthorityOverlap);
        let expected_program_data = Pubkey::find_program_address(
            &[crate::ID.as_ref()],
            &bpf_loader_upgradeable::id(),
        ).0;
        require_keys_eq!(ctx.accounts.program_data.key(), expected_program_data, MissionError::InvalidProgramData);
        require_keys_eq!(*ctx.accounts.program_data.owner, bpf_loader_upgradeable::id(), MissionError::InvalidProgramData);
        let data = ctx.accounts.program_data.try_borrow_data()?;
        // UpgradeableLoaderState::ProgramData has bincode tag 3, slot u64, then
        // Option<Pubkey>. Parse only the stable header needed for this check.
        require!(data.len() >= 45 && data[0..4] == [3, 0, 0, 0] && data[12] == 1, MissionError::InvalidProgramData);
        let upgrade_authority = Pubkey::new_from_array(data[13..45].try_into().map_err(|_| MissionError::InvalidProgramData)?);
        require_keys_eq!(ctx.accounts.authority.key(), upgrade_authority, MissionError::UnauthorizedConfig);
        require_keys_neq!(assignment_authority, upgrade_authority, MissionError::AuthorityOverlap);
        require_keys_neq!(fallback_authority, upgrade_authority, MissionError::AuthorityOverlap);
        require!(assignment_expires_at > now && assignment_expires_at <= now + MAX_ASSIGNMENT_AUTHORITY_LIFETIME, MissionError::InvalidAssignmentExpiry);
        let config = &mut ctx.accounts.config;
        config.upgrade_authority = upgrade_authority;
        config.assignment_authority = assignment_authority;
        config.fallback_authority = fallback_authority;
        config.assignment_expires_at = assignment_expires_at;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn renew_assignment_authority(
        ctx: Context<RenewAssignmentAuthority>,
        assignment_authority: Pubkey,
        assignment_expires_at: i64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let now = Clock::get()?.unix_timestamp;
        require_keys_eq!(ctx.accounts.authority.key(), config.upgrade_authority, MissionError::UnauthorizedConfig);
        require_keys_neq!(assignment_authority, config.fallback_authority, MissionError::AuthorityOverlap);
        require_keys_neq!(assignment_authority, config.upgrade_authority, MissionError::AuthorityOverlap);
        require!(assignment_expires_at > now && assignment_expires_at <= now + MAX_ASSIGNMENT_AUTHORITY_LIFETIME, MissionError::InvalidAssignmentExpiry);
        config.assignment_authority = assignment_authority;
        config.assignment_expires_at = assignment_expires_at;
        Ok(())
    }

    pub fn create_mission(
        ctx: Context<CreateMission>,
        mission_id: [u8; 16],
        terms_hash: [u8; 32],
        reward_lamports: u64,
        submit_by: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(reward_lamports > 0, MissionError::EmptyReward);
        require!(submit_by > now, MissionError::InvalidDeadline);
        let mission = &mut ctx.accounts.mission;
        mission.sponsor = ctx.accounts.sponsor.key();
        mission.participant = None;
        mission.assigned_reviewer = None;
        mission.previous_reviewer = None;
        mission.mission_id = mission_id;
        mission.terms_hash = terms_hash;
        mission.evidence_hash = None;
        mission.reward_lamports = reward_lamports;
        mission.submit_by = submit_by;
        mission.assignment_deadline = 0;
        mission.appeal_deadline = 0;
        mission.created_at = now;
        mission.status = MissionStatus::Funded;
        mission.review_round = 0;
        mission.accepted = false;
        mission.bump = ctx.bumps.mission;
        transfer(CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer { from: ctx.accounts.sponsor.to_account_info(), to: mission.to_account_info() },
        ), reward_lamports)?;
        emit!(MissionFunded { mission: mission.key(), sponsor: mission.sponsor, reward_lamports, terms_hash, submit_by });
        Ok(())
    }

    pub fn claim(ctx: Context<ClaimMission>) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        require!(mission.status == MissionStatus::Funded, MissionError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= mission.submit_by, MissionError::SubmissionWindowClosed);
        let participant = ctx.accounts.participant.key();
        require_keys_neq!(participant, mission.sponsor, MissionError::InvalidParticipant);
        mission.participant = Some(participant);
        mission.status = MissionStatus::Claimed;
        emit!(MissionClaimed { mission: mission.key(), participant });
        Ok(())
    }

    pub fn submit_evidence(ctx: Context<SubmitEvidence>, evidence_hash: [u8; 32]) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        require!(mission.status == MissionStatus::Claimed, MissionError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= mission.submit_by, MissionError::SubmissionWindowClosed);
        require_keys_eq!(ctx.accounts.participant.key(), mission.participant.ok_or(MissionError::InvalidParticipant)?, MissionError::InvalidParticipant);
        mission.evidence_hash = Some(evidence_hash);
        mission.status = MissionStatus::Submitted;
        emit!(EvidenceSubmitted { mission: mission.key(), participant: ctx.accounts.participant.key(), evidence_hash });
        Ok(())
    }

    /// The assignment key can only set/rotate the reviewer and its deadline.
    /// It has no authority over acceptance, review outcomes, or escrow.
    pub fn assign_reviewer(ctx: Context<AssignReviewer>, reviewer: Pubkey) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        let now = Clock::get()?.unix_timestamp;
        require_keys_eq!(ctx.accounts.assignment_authority.key(), ctx.accounts.config.assignment_authority, MissionError::UnauthorizedAssignment);
        require!(now <= ctx.accounts.config.assignment_expires_at, MissionError::AssignmentAuthorityExpired);
        require!(mission.status == MissionStatus::Submitted || mission.status == MissionStatus::Appealed, MissionError::WrongStatus);
        require_keys_neq!(reviewer, mission.sponsor, MissionError::InvalidReviewer);
        require_keys_neq!(reviewer, mission.participant.ok_or(MissionError::InvalidParticipant)?, MissionError::InvalidReviewer);
        require!(Some(reviewer) != mission.previous_reviewer, MissionError::ReviewerMustRotate);
        match mission.status {
            MissionStatus::Submitted if mission.assigned_reviewer.is_none() => {},
            MissionStatus::Submitted => {
                require!(now > mission.assignment_deadline, MissionError::AssignmentStillActive);
                require!(mission.review_round == 0, MissionError::BackupExpired);
                mission.previous_reviewer = mission.assigned_reviewer;
                mission.review_round = 1;
            },
            MissionStatus::Appealed => {
                require!(mission.assigned_reviewer.is_none(), MissionError::WrongStatus);
                mission.review_round = 2;
            },
            _ => return err!(MissionError::WrongStatus),
        }
        mission.assigned_reviewer = Some(reviewer);
        mission.accepted = false;
        mission.assignment_deadline = now.checked_add(REVIEW_WINDOW_SECONDS).ok_or(MissionError::ArithmeticOverflow)?;
        emit!(ReviewerAssigned { mission: mission.key(), reviewer, round: mission.review_round, deadline: mission.assignment_deadline });
        Ok(())
    }

    pub fn accept_assignment(ctx: Context<AcceptAssignment>) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        require!(mission.status == MissionStatus::Submitted || mission.status == MissionStatus::Appealed, MissionError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= mission.assignment_deadline, MissionError::ReviewWindowClosed);
        require_keys_eq!(ctx.accounts.reviewer.key(), mission.assigned_reviewer.ok_or(MissionError::NoReviewerAssigned)?, MissionError::UnauthorizedReviewer);
        mission.accepted = true;
        emit!(ReviewerAccepted { mission: mission.key(), reviewer: ctx.accounts.reviewer.key(), round: mission.review_round });
        Ok(())
    }

    pub fn decide(ctx: Context<DecideMission>, approve: bool) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        let state = mission.status;
        require!(state == MissionStatus::Submitted || state == MissionStatus::Appealed, MissionError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= mission.assignment_deadline, MissionError::ReviewWindowClosed);
        require!(mission.accepted, MissionError::AssignmentNotAccepted);
        require_keys_eq!(ctx.accounts.reviewer.key(), mission.assigned_reviewer.ok_or(MissionError::NoReviewerAssigned)?, MissionError::UnauthorizedReviewer);
        validate_participant_and_sponsor(mission, &ctx.accounts.participant, &ctx.accounts.sponsor)?;
        let participant = mission.participant.ok_or(MissionError::InvalidParticipant)?;
        if approve {
            pay_participant(mission, &ctx.accounts.participant)?;
            mission.status = MissionStatus::Paid;
            emit!(MissionResolved { mission: mission.key(), participant, reviewer: ctx.accounts.reviewer.key(), approved: true, final_review: state == MissionStatus::Appealed, reward_lamports: mission.reward_lamports });
            mission.close(ctx.accounts.sponsor.to_account_info())?;
        } else if state == MissionStatus::Submitted {
            mission.status = MissionStatus::RejectedPendingAppeal;
            mission.appeal_deadline = Clock::get()?.unix_timestamp.checked_add(REVIEW_WINDOW_SECONDS).ok_or(MissionError::ArithmeticOverflow)?;
            emit!(MissionResolved { mission: mission.key(), participant, reviewer: ctx.accounts.reviewer.key(), approved: false, final_review: false, reward_lamports: 0 });
        } else {
            mission.status = MissionStatus::RejectedFinal;
            emit!(MissionResolved { mission: mission.key(), participant, reviewer: ctx.accounts.reviewer.key(), approved: false, final_review: true, reward_lamports: 0 });
            mission.close(ctx.accounts.sponsor.to_account_info())?;
        }
        Ok(())
    }

    pub fn appeal(ctx: Context<AppealMission>) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        require!(mission.status == MissionStatus::RejectedPendingAppeal, MissionError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= mission.appeal_deadline, MissionError::AppealWindowClosed);
        require_keys_eq!(ctx.accounts.participant.key(), mission.participant.ok_or(MissionError::InvalidParticipant)?, MissionError::InvalidParticipant);
        mission.previous_reviewer = mission.assigned_reviewer;
        mission.assigned_reviewer = None;
        mission.accepted = false;
        mission.review_round = 2;
        mission.status = MissionStatus::Appealed;
        emit!(MissionAppealed { mission: mission.key(), participant: ctx.accounts.participant.key(), previous_reviewer: mission.previous_reviewer.ok_or(MissionError::NoReviewerAssigned)? });
        Ok(())
    }

    /// The assignment key can mark a timed-out case for the separate operator wallet.
    pub fn escalate(ctx: Context<EscalateMission>) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        require_keys_eq!(ctx.accounts.assignment_authority.key(), ctx.accounts.config.assignment_authority, MissionError::UnauthorizedAssignment);
        let now = Clock::get()?.unix_timestamp;
        require!(now <= ctx.accounts.config.assignment_expires_at, MissionError::AssignmentAuthorityExpired);
        let timed_out = match mission.status {
            MissionStatus::Submitted => now > mission.assignment_deadline && mission.review_round <= 1,
            MissionStatus::Appealed => now > mission.assignment_deadline,
            _ => false,
        };
        require!(timed_out, MissionError::NotExpired);
        mission.status = MissionStatus::Escalated;
        emit!(MissionEscalated { mission: mission.key(), round: mission.review_round });
        Ok(())
    }

    pub fn resolve_escalated(ctx: Context<ResolveEscalated>, approve: bool) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        require!(mission.status == MissionStatus::Escalated, MissionError::WrongStatus);
        require_keys_eq!(ctx.accounts.operator.key(), ctx.accounts.config.fallback_authority, MissionError::UnauthorizedFallback);
        require_keys_neq!(ctx.accounts.operator.key(), mission.sponsor, MissionError::InvalidFallback);
        require_keys_neq!(ctx.accounts.operator.key(), mission.participant.ok_or(MissionError::InvalidParticipant)?, MissionError::InvalidFallback);
        require!(Some(ctx.accounts.operator.key()) != mission.assigned_reviewer && Some(ctx.accounts.operator.key()) != mission.previous_reviewer, MissionError::InvalidFallback);
        validate_participant_and_sponsor(mission, &ctx.accounts.participant, &ctx.accounts.sponsor)?;
        let participant = mission.participant.ok_or(MissionError::InvalidParticipant)?;
        let round = mission.review_round;
        if approve { pay_participant(mission, &ctx.accounts.participant)?; }
        mission.status = if approve { MissionStatus::Paid } else { MissionStatus::RejectedFinal };
        emit!(FallbackResolved { mission: mission.key(), participant, operator: ctx.accounts.operator.key(), approved: approve, round });
        mission.close(ctx.accounts.sponsor.to_account_info())?;
        Ok(())
    }

    pub fn finalize_rejection(ctx: Context<FinalizeRejection>) -> Result<()> {
        let mission = &ctx.accounts.mission;
        require!(mission.status == MissionStatus::RejectedPendingAppeal, MissionError::WrongStatus);
        require!(Clock::get()?.unix_timestamp > mission.appeal_deadline, MissionError::AppealWindowOpen);
        require_keys_eq!(ctx.accounts.sponsor.key(), mission.sponsor, MissionError::InvalidSponsor);
        emit!(RejectionFinalized { mission: mission.key(), sponsor: mission.sponsor });
        ctx.accounts.mission.close(ctx.accounts.sponsor.to_account_info())?;
        Ok(())
    }

    pub fn refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
        let mission = &ctx.accounts.mission;
        require_keys_eq!(ctx.accounts.sponsor.key(), mission.sponsor, MissionError::InvalidSponsor);
        let now = Clock::get()?.unix_timestamp;
        require!((mission.status == MissionStatus::Funded || mission.status == MissionStatus::Claimed) && now > mission.submit_by, MissionError::NotExpired);
        emit!(MissionRefunded { mission: mission.key(), sponsor: mission.sponsor, previous_status: mission.status, reward_lamports: mission.reward_lamports });
        ctx.accounts.mission.close(ctx.accounts.sponsor.to_account_info())?;
        Ok(())
    }
}

const REVIEW_WINDOW_SECONDS: i64 = 24 * 60 * 60;
const MAX_ASSIGNMENT_AUTHORITY_LIFETIME: i64 = 7 * 24 * 60 * 60;

fn validate_participant_and_sponsor(mission: &Account<Mission>, participant: &UncheckedAccount, sponsor: &UncheckedAccount) -> Result<()> {
    require_keys_eq!(sponsor.key(), mission.sponsor, MissionError::InvalidSponsor);
    require_keys_eq!(participant.key(), mission.participant.ok_or(MissionError::InvalidParticipant)?, MissionError::InvalidParticipant);
    Ok(())
}

fn pay_participant(mission: &Account<Mission>, participant: &UncheckedAccount) -> Result<()> {
    let mission_info = mission.to_account_info();
    let participant_info = participant.to_account_info();
    let reward = mission.reward_lamports;
    let escrow_after = mission_info.lamports().checked_sub(reward).ok_or(MissionError::EscrowUnderfunded)?;
    let participant_after = participant_info.lamports().checked_add(reward).ok_or(MissionError::ArithmeticOverflow)?;
    **mission_info.try_borrow_mut_lamports()? = escrow_after;
    **participant_info.try_borrow_mut_lamports()? = participant_after;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)] pub authority: Signer<'info>,
    /// CHECK: Must be the upgradeable loader ProgramData account for this program.
    pub program_data: UncheckedAccount<'info>,
    #[account(init, payer = authority, space = 8 + AtlasConfig::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, AtlasConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RenewAssignmentAuthority<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)] pub config: Account<'info, AtlasConfig>,
}

#[derive(Accounts)]
#[instruction(mission_id: [u8; 16])]
pub struct CreateMission<'info> {
    #[account(mut)] pub sponsor: Signer<'info>,
    #[account(init, payer = sponsor, space = 8 + Mission::INIT_SPACE, seeds = [b"mission", sponsor.key().as_ref(), mission_id.as_ref()], bump)]
    pub mission: Account<'info, Mission>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AssignReviewer<'info> {
    #[account(seeds = [b"config"], bump = config.bump)] pub config: Account<'info, AtlasConfig>,
    pub assignment_authority: Signer<'info>,
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)] pub mission: Account<'info, Mission>,
}
#[derive(Accounts)]
pub struct AcceptAssignment<'info> {
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)] pub mission: Account<'info, Mission>,
    pub reviewer: Signer<'info>,
}
#[derive(Accounts)]
pub struct ClaimMission<'info> {
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)] pub mission: Account<'info, Mission>,
    pub participant: Signer<'info>,
}
#[derive(Accounts)]
pub struct SubmitEvidence<'info> {
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)] pub mission: Account<'info, Mission>,
    pub participant: Signer<'info>,
}
#[derive(Accounts)]
pub struct DecideMission<'info> {
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)] pub mission: Account<'info, Mission>,
    pub reviewer: Signer<'info>,
    /// CHECK: Must equal the participant stored by claim.
    #[account(mut)] pub participant: UncheckedAccount<'info>,
    /// CHECK: Must equal the sponsor stored at creation.
    #[account(mut)] pub sponsor: UncheckedAccount<'info>,
}
#[derive(Accounts)]
pub struct AppealMission<'info> {
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)] pub mission: Account<'info, Mission>,
    pub participant: Signer<'info>,
}
#[derive(Accounts)]
pub struct EscalateMission<'info> {
    #[account(seeds = [b"config"], bump = config.bump)] pub config: Account<'info, AtlasConfig>,
    pub assignment_authority: Signer<'info>,
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)] pub mission: Account<'info, Mission>,
}
#[derive(Accounts)]
pub struct ResolveEscalated<'info> {
    #[account(seeds = [b"config"], bump = config.bump)] pub config: Account<'info, AtlasConfig>,
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)] pub mission: Account<'info, Mission>,
    pub operator: Signer<'info>,
    /// CHECK: Must equal the participant stored by claim.
    #[account(mut)] pub participant: UncheckedAccount<'info>,
    /// CHECK: Must equal the sponsor stored at creation.
    #[account(mut)] pub sponsor: UncheckedAccount<'info>,
}
#[derive(Accounts)]
pub struct FinalizeRejection<'info> {
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)] pub mission: Account<'info, Mission>,
    /// CHECK: Must equal sponsor stored in the mission.
    #[account(mut)] pub sponsor: UncheckedAccount<'info>,
}
#[derive(Accounts)]
pub struct RefundExpired<'info> {
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)] pub mission: Account<'info, Mission>,
    /// CHECK: Must equal sponsor stored in the mission.
    #[account(mut)] pub sponsor: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct AtlasConfig { pub upgrade_authority: Pubkey, pub assignment_authority: Pubkey, pub fallback_authority: Pubkey, pub assignment_expires_at: i64, pub bump: u8 }

#[account]
#[derive(InitSpace)]
pub struct Mission {
    pub sponsor: Pubkey,
    pub participant: Option<Pubkey>,
    pub assigned_reviewer: Option<Pubkey>,
    pub previous_reviewer: Option<Pubkey>,
    pub mission_id: [u8; 16],
    pub terms_hash: [u8; 32],
    pub evidence_hash: Option<[u8; 32]>,
    pub reward_lamports: u64,
    pub submit_by: i64,
    pub assignment_deadline: i64,
    pub appeal_deadline: i64,
    pub created_at: i64,
    pub status: MissionStatus,
    pub review_round: u8,
    pub accepted: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MissionStatus { Funded, Claimed, Submitted, Appealed, RejectedPendingAppeal, Escalated, Paid, RejectedFinal }

#[event]
pub struct MissionFunded { pub mission: Pubkey, pub sponsor: Pubkey, pub reward_lamports: u64, pub terms_hash: [u8; 32], pub submit_by: i64 }
#[event]
pub struct MissionClaimed { pub mission: Pubkey, pub participant: Pubkey }
#[event]
pub struct EvidenceSubmitted { pub mission: Pubkey, pub participant: Pubkey, pub evidence_hash: [u8; 32] }
#[event]
pub struct ReviewerAssigned { pub mission: Pubkey, pub reviewer: Pubkey, pub round: u8, pub deadline: i64 }
#[event]
pub struct ReviewerAccepted { pub mission: Pubkey, pub reviewer: Pubkey, pub round: u8 }
#[event]
pub struct MissionResolved { pub mission: Pubkey, pub participant: Pubkey, pub reviewer: Pubkey, pub approved: bool, pub final_review: bool, pub reward_lamports: u64 }
#[event]
pub struct MissionAppealed { pub mission: Pubkey, pub participant: Pubkey, pub previous_reviewer: Pubkey }
#[event]
pub struct MissionEscalated { pub mission: Pubkey, pub round: u8 }
#[event]
pub struct FallbackResolved { pub mission: Pubkey, pub participant: Pubkey, pub operator: Pubkey, pub approved: bool, pub round: u8 }
#[event]
pub struct RejectionFinalized { pub mission: Pubkey, pub sponsor: Pubkey }
#[event]
pub struct MissionRefunded { pub mission: Pubkey, pub sponsor: Pubkey, pub previous_status: MissionStatus, pub reward_lamports: u64 }

#[error_code]
pub enum MissionError {
    #[msg("Reward must be greater than zero.")] EmptyReward,
    #[msg("Submission deadline must be in the future.")] InvalidDeadline,
    #[msg("Mission is not in the required state.")] WrongStatus,
    #[msg("Submission deadline has passed.")] SubmissionWindowClosed,
    #[msg("Review window has ended.")] ReviewWindowClosed,
    #[msg("Only the assigned reviewer may act on this review.")] UnauthorizedReviewer,
    #[msg("Sponsor does not match this mission.")] InvalidSponsor,
    #[msg("Participant does not match this mission.")] InvalidParticipant,
    #[msg("Escrow balance is below the promised reward.")] EscrowUnderfunded,
    #[msg("Lamport balance arithmetic overflowed.")] ArithmeticOverflow,
    #[msg("Mission has not reached its expiry.")] NotExpired,
    #[msg("The program data account is invalid.")] InvalidProgramData,
    #[msg("Only the current program upgrade authority may initialize configuration.")] UnauthorizedConfig,
    #[msg("Assignment and fallback authorities must be separate wallets.")] AuthorityOverlap,
    #[msg("Assignment authority must expire within seven days.")] InvalidAssignmentExpiry,
    #[msg("The restricted assignment authority has expired.")] AssignmentAuthorityExpired,
    #[msg("Atlas fallback must be separate from the mission parties and assigned reviewers.")] InvalidFallback,
    #[msg("Only the configured assignment key may assign reviewers or escalate.")] UnauthorizedAssignment,
    #[msg("The selected reviewer conflicts with a mission wallet.")] InvalidReviewer,
    #[msg("Appeal reviewers must be different from the first reviewer.")] ReviewerMustRotate,
    #[msg("The current reviewer assignment has not timed out.")] AssignmentStillActive,
    #[msg("The backup assignment has expired and must be escalated.")] BackupExpired,
    #[msg("No reviewer is assigned.")] NoReviewerAssigned,
    #[msg("The reviewer must accept the assignment before deciding.")] AssignmentNotAccepted,
    #[msg("The appeal period has ended.")] AppealWindowClosed,
    #[msg("The appeal period is still open.")] AppealWindowOpen,
    #[msg("Only the configured Atlas fallback wallet may resolve escalated cases.")] UnauthorizedFallback,
}
