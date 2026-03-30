/**
 * update-prod-flag.ts
 *
 * Updates a single flag value in production Firebase Remote Config.
 * Creates an audit trail via GitHub Actions summary.
 *
 * Refactored to follow functional programming principles.
 */

import { isSuccess, isFailure, success, failure, type Result, pipe, map, flatMap } from "../lib/fp.js";
import { findParameter, updateParameterValue } from "../lib/template.js";
import {
    getAccessToken,
    fetchTemplate,
    publishTemplate,
    log,
    type EffectError,
} from "../lib/effects.js";
import { FIREBASE_PROJECTS } from "../lib/types.js";
import type { FirebaseNamespace } from "../lib/types.js";

// ============================================================================
// Types
// ============================================================================

interface UpdateArgs {
    readonly flagKey: string;
    readonly value: string;
    readonly reason: string;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

const parseCliArgs = (argv: readonly string[]): UpdateArgs => {
    const args = argv.slice(2);

    const getArg = (name: string): string => {
        const arg = args.find((a) => a.startsWith(`--${name}=`));
        return arg ? arg.split("=").slice(1).join("=") : "";
    };

    return {
        flagKey: getArg("key"),
        value: getArg("value"),
        reason: getArg("reason") || "Manual update",
    };
};

// ============================================================================
// Main
// ============================================================================

const main = async (): Promise<Result<EffectError | { _tag: "LogicError"; message: string }, void>> => {
    const { flagKey, value, reason } = parseCliArgs(process.argv);

    if (!flagKey || !value) {
        return failure({ _tag: "LogicError", message: "Usage: update-prod-flag.js --key=<flag_key> --value=<value> [--reason=<reason>]" });
    }

    log.info("🔧 Update Production Flag");
    log.info(`Flag: ${flagKey}`);
    log.info(`Value: ${value}`);
    log.info(`Reason: ${reason}`);
    log.divider();

    const prodConfig = FIREBASE_PROJECTS["prod-ecom-test"];

    const accessTokenRes = getAccessToken();
    if (isFailure(accessTokenRes)) return accessTokenRes;
    const accessToken = accessTokenRes.value;

    log.info("Searching for flag in production templates...");

    const clientNamespace: FirebaseNamespace = "firebase";
    const serverNamespace: FirebaseNamespace = "firebase-server";

    const clientTemplateRes = fetchTemplate(prodConfig.projectId, clientNamespace, accessToken);

    let template: any = null;
    let namespace: FirebaseNamespace = clientNamespace;
    let found: any = null;

    if (isSuccess(clientTemplateRes)) {
        found = findParameter(clientTemplateRes.value, flagKey);
        if (found) {
            template = clientTemplateRes.value;
            log.info("Found flag in CLIENT namespace.");
        }
    }

    if (!found) {
        const serverTemplateRes = fetchTemplate(prodConfig.projectId, serverNamespace, accessToken);
        if (isSuccess(serverTemplateRes)) {
            found = findParameter(serverTemplateRes.value, flagKey);
            if (found) {
                template = serverTemplateRes.value;
                namespace = serverNamespace;
                log.info("Found flag in SERVER namespace.");
            }
        }
    }

    if (!template || !found) {
        return failure({ _tag: "LogicError", message: `Flag ${flagKey} not found in production template (checked both client and server)` });
    }

    log.info(`Found in group: ${found.groupName}`);
    log.info(`Current value: ${found.parameter.defaultValue.value}`);

    const updated = updateParameterValue(template, flagKey, value);

    return pipe(
        publishTemplate(prodConfig.projectId, updated, namespace, accessToken),
        map(() => {
            log.success(`Updated ${flagKey} to ${value}`);
            return undefined;
        })
    );
};

main().then(res => {
    if (isFailure(res)) {
        log.error(`Fatal error: ${res.error.message}`);
        process.exit(1);
    }
}).catch((err) => {
    log.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
