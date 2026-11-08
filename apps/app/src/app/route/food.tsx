import { Redirect } from "expo-router";

/** `/route/food`, the old sample food list's address: the dishes of the city it showed. */
export default function OldFoodList() {
  return <Redirect href={{ pathname: "/dishes", params: { city: "bursa" } }} />;
}
