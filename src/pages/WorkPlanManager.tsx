import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export default function WorkPlanManager() {
  return (
    <div className="flex min-h-svh p-6">
      <Field>
        <FieldLabel htmlFor="picture">Picture</FieldLabel>
        <Input id="picture" type="file" />
        <FieldDescription>Select a picture to upload.</FieldDescription>
      </Field>
    </div>
  )
}
