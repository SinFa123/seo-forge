import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import {
  createFormValidationErrors,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";

type YoutubeSearchValues = {
  keyword: string;
  locationCode: number;
  serpRowLimit: number;
};

function validate(
  value: YoutubeSearchValues,
  shouldValidateUntouched: boolean,
  validateEmpty: boolean,
) {
  if (value.keyword.trim().length === 0) {
    if (!validateEmpty) return null;
    return createFormValidationErrors({
      fields: { keyword: "Please enter a keyword." },
    });
  }
  if (!shouldValidateUntouched) return null;
  if (value.keyword.trim().length > 200) {
    return createFormValidationErrors({
      fields: { keyword: "Keep the keyword under 200 characters." },
    });
  }
  return null;
}

/** Search bar form; resets whenever the URL-driven values change. */
export function useYoutubeSearchForm(
  input: YoutubeSearchValues,
  onSubmit: (value: YoutubeSearchValues) => void,
) {
  const form = useForm({
    defaultValues: input,
    validators: {
      onChange: ({ formApi, value }) =>
        validate(value, shouldValidateFieldOnChange(formApi, "keyword"), false),
      onSubmit: ({ value }) => validate(value, true, true),
    },
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  useEffect(() => {
    form.reset({
      keyword: input.keyword,
      locationCode: input.locationCode,
      serpRowLimit: input.serpRowLimit,
    });
  }, [form, input.keyword, input.locationCode, input.serpRowLimit]);

  return form;
}
