from __future__ import annotations

import hashlib

from app.ai import mock
from app.ai.prompts import PROJECT_EVALUATOR_SYSTEM, PROMPT_VERSIONS
from app.ai.provider import MockProvider, get_eval_provider
from app.ai.schemas import ProjectEvalResult

PROMPT_VERSION = PROMPT_VERSIONS["project_evaluator"]


def evaluate_project(
    *,
    brief: str,
    rubric: list[dict],
    inventory: list[str],
    readme_text: str,
    doc_text: str,
    db_script: str,
    source_excerpts: dict[str, str],
) -> ProjectEvalResult:
    has_readme = any(f.lower().endswith("readme.md") for f in inventory)
    has_db = bool(db_script.strip()) or any(f.lower().endswith(".sql") for f in inventory)
    digest = hashlib.sha256(("".join(sorted(inventory)) + readme_text + db_script).encode()).hexdigest()

    provider = get_eval_provider()
    if isinstance(provider, MockProvider):
        return ProjectEvalResult.model_validate(
            mock.mock_project_eval(
                rubric=rubric, inventory=inventory, has_readme=has_readme, has_db=has_db, digest=digest
            )
        )

    src = "\n\n".join(f"### {p}\n```\n{c[:3000]}\n```" for p, c in source_excerpts.items())
    rubric_txt = "\n".join(f"- {c['key']} / {c['name']} (max {c['max_marks']})" for c in rubric)
    user = f"""PROJECT BRIEF:
\"\"\"{brief}\"\"\"

RUBRIC (score ONLY these):
{rubric_txt}

FILE INVENTORY ({len(inventory)}):
{chr(10).join(inventory)}

README.md:
\"\"\"{readme_text[:6000]}\"\"\"

DOCUMENTATION:
\"\"\"{doc_text[:6000]}\"\"\"

DATABASE SCRIPT:
```
{db_script[:6000]}
```

SOURCE EXCERPTS:
{src}

Return ONE JSON object: rubric_scores[{{key,name,score,max_score,evidence[]}}], checks[{{name,passed,detail}}],
strengths[], weaknesses[], recommendations[], explanation, confidence (0-1),
ai_content_probability (0-1), ai_content_classification (LOW|MODERATE|HIGH), ai_content_evidence[].
"""
    return provider.complete_json(
        system=PROJECT_EVALUATOR_SYSTEM, user=user, schema=ProjectEvalResult, max_tokens=3800
    )
