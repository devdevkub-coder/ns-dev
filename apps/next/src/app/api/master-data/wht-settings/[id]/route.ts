import { errorJson, type MasterDataRouteProps } from '@/lib/server/master-data'
import { patchSimpleMasterData } from '@/lib/server/simple-master-tables'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const { id } = await params
    return await patchSimpleMasterData(request, 'whtSettings', id)
  } catch (caught) {
    return errorJson(caught, 'อัปเดตสถานะอัตรา WHT ไม่ได้')
  }
}
