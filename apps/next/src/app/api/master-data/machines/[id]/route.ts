import { errorJson, type MasterDataRouteProps } from '@/lib/server/master-data'
import { patchSimpleMasterData } from '@/lib/server/simple-master-tables'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const { id } = await params
    return await patchSimpleMasterData(request, 'machines', id)
  } catch (caught) {
    return errorJson(caught, 'อัปเดตสถานะเครื่องจักรไม่ได้')
  }
}
