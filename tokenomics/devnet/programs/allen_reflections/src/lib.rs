use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
const MIN_BUY_LAMPORTS: u64 = LAMPORTS_PER_SOL;
const REFLECTION_NUMERATOR: u64 = 3;
const REFLECTION_DENOMINATOR: u64 = 100_000;

#[program]
pub mod allen_reflections {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.pool = ctx.accounts.pool.key();
        config.total_reflection_lamports = 0;
        config.total_eligible_buys = 0;
        Ok(())
    }

    /// Devnet-only economic prototype. This records a qualifying SOL buy
    /// and moves the calculated reflection amount into the pool.
    /// It does NOT detect Pump.fun trades automatically.
    pub fn record_buy(ctx: Context<RecordBuy>, buy_lamports: u64) -> Result<()> {
        require!(buy_lamports >= MIN_BUY_LAMPORTS, ErrorCode::BuyTooSmall);

        let reflection = buy_lamports
            .checked_mul(REFLECTION_NUMERATOR)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(REFLECTION_DENOMINATOR)
            .ok_or(ErrorCode::MathOverflow)?;

        require!(reflection > 0, ErrorCode::MathOverflow);

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.buyer.key(),
            &ctx.accounts.pool.key(),
            reflection,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.pool.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let config = &mut ctx.accounts.config;
        config.total_reflection_lamports = config
            .total_reflection_lamports
            .checked_add(reflection)
            .ok_or(ErrorCode::MathOverflow)?;
        config.total_eligible_buys = config
            .total_eligible_buys
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;

        emit!(ReflectionAccrued {
            buyer: ctx.accounts.buyer.key(),
            buy_lamports,
            reflection_lamports: reflection,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + ReflectionConfig::SIZE)]
    pub config: Account<'info, ReflectionConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Pool is only used as the SOL destination in this devnet prototype.
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordBuy<'info> {
    #[account(mut)]
    pub config: Account<'info, ReflectionConfig>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Pool address is constrained by the stored configuration.
    #[account(mut, address = config.pool)]
    pub pool: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct ReflectionConfig {
    pub authority: Pubkey,
    pub pool: Pubkey,
    pub total_reflection_lamports: u64,
    pub total_eligible_buys: u64,
}

impl ReflectionConfig {
    pub const SIZE: usize = 32 + 32 + 8 + 8;
}

#[event]
pub struct ReflectionAccrued {
    pub buyer: Pubkey,
    pub buy_lamports: u64,
    pub reflection_lamports: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Buy must be at least 1 SOL.")]
    BuyTooSmall,
    #[msg("Arithmetic overflow.")]
    MathOverflow,
}