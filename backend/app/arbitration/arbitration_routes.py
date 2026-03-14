"""
arbitration/arbitration_routes.py — Dispute and voting endpoints.

  POST /disputes            — Raise a dispute and auto-select a jury
  GET  /disputes/{id}       — Retrieve dispute details (votes hidden until resolved)
  POST /arbitration/vote    — Submit a juror vote (triggers resolution when 3/3)
"""

import logging

from fastapi import APIRouter, Depends, status

from app.arbitration.dispute_service import (
    create_dispute,
    get_dispute,
    get_votes_for_dispute,
    submit_vote,
)
from app.database.models import (
    DisputeCreate,
    DisputeResponse,
    TokenData,
    VoteResponse,
    VoteSubmit,
)
from app.middleware.rbac_middleware import get_current_user
from app.rbac.authorization import require_permission
from app.rbac.permissions import Permission

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Arbitration"])


@router.post(
    "/disputes",
    response_model=DisputeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Raise a new dispute",
    description=(
        "**Required role:** `CLIENT` or `ADMIN`  \n"
        "**Required permission:** `raise_dispute`  \n\n"
        "Creates a milestone dispute, selects a jury of 3 skill-matched users, "
        "and transitions the dispute to `in_arbitration`."
    ),
)
async def create_dispute_endpoint(
    payload: DisputeCreate,
    current_user: TokenData = Depends(require_permission(Permission.RAISE_DISPUTE)),
) -> DisputeResponse:
    dispute = create_dispute(
        client_id=current_user.user_id,
        job_id=payload.job_id,
        freelancer_id=payload.freelancer_id,
        skill=payload.skill,
    )

    return DisputeResponse(
        id=dispute.id,
        job_id=dispute.job_id,
        client_id=dispute.client_id,
        freelancer_id=dispute.freelancer_id,
        skill=dispute.skill,
        status=dispute.status,
        jury=dispute.jury,
        result=dispute.result,
        votes=None,  # Not resolved yet — votes are hidden
        created_at=dispute.created_at,
    )


@router.get(
    "/disputes/{dispute_id}",
    response_model=DisputeResponse,
    summary="Get dispute details",
    description=(
        "Returns dispute info. **Votes are only visible after resolution.**"
    ),
)
async def get_dispute_endpoint(
    dispute_id: str,
    current_user: TokenData = Depends(get_current_user),
) -> DisputeResponse:
    dispute = get_dispute(dispute_id)

    # Only expose votes once the dispute is resolved
    votes = None
    if dispute.status.value == "resolved":
        votes = get_votes_for_dispute(dispute_id)

    return DisputeResponse(
        id=dispute.id,
        job_id=dispute.job_id,
        client_id=dispute.client_id,
        freelancer_id=dispute.freelancer_id,
        skill=dispute.skill,
        status=dispute.status,
        jury=dispute.jury,
        result=dispute.result,
        votes=votes,
        created_at=dispute.created_at,
    )


@router.post(
    "/arbitration/vote",
    response_model=VoteResponse,
    summary="Submit a juror vote",
    description=(
        "Jurors submit their decision for a dispute. Votes are blind — "
        "no juror can see another's vote until all 3 have been cast.\n\n"
        "Once all jurors vote, the dispute is automatically resolved via "
        "majority decision. Reputation scores are updated accordingly."
    ),
)
async def submit_vote_endpoint(
    payload: VoteSubmit,
    current_user: TokenData = Depends(get_current_user),
) -> VoteResponse:
    result = submit_vote(
        dispute_id=payload.dispute_id,
        juror_id=current_user.user_id,
        decision=payload.decision,
    )

    return VoteResponse(
        message=result["message"],
        dispute_id=payload.dispute_id,
        decision=payload.decision,
        dispute_resolved=result["dispute_resolved"],
        result=result["result"],
    )
