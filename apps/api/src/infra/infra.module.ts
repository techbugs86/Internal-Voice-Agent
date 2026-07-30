import { Global, Module } from "@nestjs/common";
import { RecaptchaService } from "./captcha/recaptcha.service";
import { PromptCompilerService } from "./prompt/prompt-compiler.service";
import { RetellService } from "./retell/retell.service";
import { SupabaseAuthService } from "./supabase/supabase-auth.service";

/**
 * Every outbound integration, in one module.
 *
 * Global because these are stateless adapters with no per-feature configuration
 * — making each feature module re-import them would be ceremony without value.
 * The boundary that matters is the one below: only classes in `infra/` know
 * about a third party, and nothing in `infra/` knows about our domain.
 */
@Global()
@Module({
  providers: [
    SupabaseAuthService,
    RetellService,
    PromptCompilerService,
    RecaptchaService,
  ],
  exports: [
    SupabaseAuthService,
    RetellService,
    PromptCompilerService,
    RecaptchaService,
  ],
})
export class InfraModule {}
