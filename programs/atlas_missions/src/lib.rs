use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("D6jfm1re7c7edV47j9io9SkLXXN2FhjhWCu3Y66mUvnX");

#[program]
pub mod atlas_missions {
    use super::*;

    pub fn create_mission(ctx: Context<CreateMission>, mission_id: [u8; 16], terms_hash: [u8; 32], reward_lamports: u64, submit_by: i64, review_by: i64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(reward_lamports > 0, MissionError::EmptyReward);
        require!(submit_by > now && review_by > submit_by, MissionError::InvalidDeadline);
        require_keys_neq!(ctx.accounts.sponsor.key(), ctx.accounts.reviewer.key(), MissionError::SponsorCannotReview);
        let mission = &mut ctx.accounts.mission;
        mission.sponsor = ctx.accounts.sponsor.key(); mission.reviewer = ctx.accounts.reviewer.key();
        mission.participant = None; mission.mission_id = mission_id; mission.terms_hash = terms_hash;
        mission.evidence_hash = None; mission.reward_lamports = reward_lamports;
        mission.submit_by = submit_by; mission.review_by = review_by; mission.created_at = now;
        mission.status = MissionStatus::Funded; mission.bump = ctx.bumps.mission;
        transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(), Transfer {
            from: ctx.accounts.sponsor.to_account_info(), to: mission.to_account_info(),
        }), reward_lamports)?;
        emit!(MissionFunded { mission: mission.key(), sponsor: mission.sponsor, reviewer: mission.reviewer, reward_lamports, terms_hash, submit_by, review_by });
        Ok(())
    }

    pub fn claim(ctx: Context<ClaimMission>) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        require!(mission.status == MissionStatus::Funded, MissionError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= mission.submit_by, MissionError::SubmissionWindowClosed);
        let participant = ctx.accounts.participant.key();
        require_keys_neq!(participant, mission.sponsor, MissionError::InvalidParticipant);
        require_keys_neq!(participant, mission.reviewer, MissionError::InvalidParticipant);
        mission.participant = Some(participant); mission.status = MissionStatus::Claimed;
        emit!(MissionClaimed { mission: mission.key(), participant }); Ok(())
    }

    pub fn submit_evidence(ctx: Context<SubmitEvidence>, evidence_hash: [u8; 32]) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        require!(mission.status == MissionStatus::Claimed, MissionError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= mission.submit_by, MissionError::SubmissionWindowClosed);
        require_keys_eq!(ctx.accounts.participant.key(), mission.participant.ok_or(MissionError::InvalidParticipant)?, MissionError::InvalidParticipant);
        mission.evidence_hash = Some(evidence_hash); mission.status = MissionStatus::Submitted;
        emit!(EvidenceSubmitted { mission: mission.key(), participant: ctx.accounts.participant.key(), evidence_hash }); Ok(())
    }

    pub fn resolve(ctx: Context<ResolveMission>, approve: bool) -> Result<()> {
        let mission = &mut ctx.accounts.mission;
        require!(mission.status == MissionStatus::Submitted, MissionError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= mission.review_by, MissionError::ReviewWindowClosed);
        require_keys_eq!(ctx.accounts.reviewer.key(), mission.reviewer, MissionError::UnauthorizedReviewer);
        require_keys_eq!(ctx.accounts.sponsor.key(), mission.sponsor, MissionError::InvalidSponsor);
        let participant = mission.participant.ok_or(MissionError::InvalidParticipant)?;
        require_keys_eq!(ctx.accounts.participant.key(), participant, MissionError::InvalidParticipant);
        if approve {
            let mission_info = mission.to_account_info(); let participant_info = ctx.accounts.participant.to_account_info();
            let reward = mission.reward_lamports;
            require!(mission_info.lamports() >= reward, MissionError::EscrowUnderfunded);
            **mission_info.try_borrow_mut_lamports()? -= reward;
            **participant_info.try_borrow_mut_lamports()? += reward;
            mission.status = MissionStatus::Paid;
        } else { mission.status = MissionStatus::Rejected; }
        emit!(MissionResolved { mission: mission.key(), participant, reviewer: mission.reviewer, approved: approve, reward_lamports: if approve { mission.reward_lamports } else { 0 } });
        // Anchor closes the PDA to sponsor: rent on approval, reward plus rent on rejection.
        Ok(())
    }

    pub fn refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
        let mission = &ctx.accounts.mission;
        require_keys_eq!(ctx.accounts.sponsor.key(), mission.sponsor, MissionError::InvalidSponsor);
        let now = Clock::get()?.unix_timestamp;
        let expired = match mission.status {
            MissionStatus::Funded | MissionStatus::Claimed => now > mission.submit_by,
            MissionStatus::Submitted => now > mission.review_by,
            MissionStatus::Paid | MissionStatus::Rejected => false,
        };
        require!(expired, MissionError::NotExpired);
        emit!(MissionRefunded { mission: mission.key(), sponsor: mission.sponsor, previous_status: mission.status, reward_lamports: mission.reward_lamports });
        // Closing the PDA transfers its reward and rent reserve to sponsor.
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(mission_id: [u8; 16])]
pub struct CreateMission<'info> {
    #[account(mut)] pub sponsor: Signer<'info>,
    /// CHECK: Stored as reviewer and checked again when resolving.
    pub reviewer: UncheckedAccount<'info>,
    #[account(init, payer = sponsor, space = 8 + Mission::INIT_SPACE, seeds = [b"mission", sponsor.key().as_ref(), mission_id.as_ref()], bump)]
    pub mission: Account<'info, Mission>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimMission<'info> {
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)]
    pub mission: Account<'info, Mission>,
    pub participant: Signer<'info>,
}

#[derive(Accounts)]
pub struct SubmitEvidence<'info> {
    #[account(mut, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)]
    pub mission: Account<'info, Mission>,
    pub participant: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveMission<'info> {
    #[account(mut, close = sponsor, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)]
    pub mission: Account<'info, Mission>,
    pub reviewer: Signer<'info>,
    /// CHECK: Must match the participant wallet stored in the mission.
    #[account(mut)] pub participant: UncheckedAccount<'info>,
    /// CHECK: Must match the sponsor stored in the mission; receives rent/refund.
    #[account(mut)] pub sponsor: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct RefundExpired<'info> {
    #[account(mut, close = sponsor, seeds = [b"mission", mission.sponsor.as_ref(), mission.mission_id.as_ref()], bump = mission.bump)]
    pub mission: Account<'info, Mission>,
    /// CHECK: Must match the sponsor stored in the mission.
    #[account(mut)] pub sponsor: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Mission {
    pub sponsor: Pubkey, pub reviewer: Pubkey, pub participant: Option<Pubkey>,
    pub mission_id: [u8; 16], pub terms_hash: [u8; 32], pub evidence_hash: Option<[u8; 32]>,
    pub reward_lamports: u64, pub submit_by: i64, pub review_by: i64, pub created_at: i64,
    pub status: MissionStatus, pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MissionStatus { Funded, Claimed, Submitted, Paid, Rejected }

#[event]
pub struct MissionFunded { pub mission: Pubkey, pub sponsor: Pubkey, pub reviewer: Pubkey, pub reward_lamports: u64, pub terms_hash: [u8; 32], pub submit_by: i64, pub review_by: i64 }
#[event]
pub struct MissionClaimed { pub mission: Pubkey, pub participant: Pubkey }
#[event]
pub struct EvidenceSubmitted { pub mission: Pubkey, pub participant: Pubkey, pub evidence_hash: [u8; 32] }
#[event]
pub struct MissionResolved { pub mission: Pubkey, pub participant: Pubkey, pub reviewer: Pubkey, pub approved: bool, pub reward_lamports: u64 }
#[event]
pub struct MissionRefunded { pub mission: Pubkey, pub sponsor: Pubkey, pub previous_status: MissionStatus, pub reward_lamports: u64 }

#[error_code]
pub enum MissionError {
    #[msg("Reward must be greater than zero.")] EmptyReward,
    #[msg("Submission must be in the future and review must follow submission.")] InvalidDeadline,
    #[msg("Sponsor cannot review their own mission.")] SponsorCannotReview,
    #[msg("Mission is not in the required state.")] WrongStatus,
    #[msg("Submission deadline has passed.")] SubmissionWindowClosed,
    #[msg("Review deadline has passed.")] ReviewWindowClosed,
    #[msg("Only the designated reviewer may resolve this mission.")] UnauthorizedReviewer,
    #[msg("Sponsor does not match this mission.")] InvalidSponsor,
    #[msg("Participant does not match this mission.")] InvalidParticipant,
    #[msg("Escrow balance is below the promised reward.")] EscrowUnderfunded,
    #[msg("Mission has not reached its refund expiry.")] NotExpired,
}
