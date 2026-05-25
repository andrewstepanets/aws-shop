import { delay, http, HttpResponse } from "msw";
import API_PATHS from "~/constants/apiPaths";
import { availableProducts, orders, products, cart } from "~/mocks/data";
import { CartItem } from "~/models/CartItem";
import { Order } from "~/models/Order";
import { AvailableProduct, Product } from "~/models/Product";

export const handlers = [
  http.get(`${API_PATHS.bff}/product`, async () => {
    await delay();
    return HttpResponse.json<Product[]>(products);
  }),
  http.put(`${API_PATHS.bff}/product`, () => {
    return new HttpResponse(null, { status: 200 });
  }),
  http.delete(`${API_PATHS.bff}/product/:id`, () => {
    return new HttpResponse(null, { status: 200 });
  }),
  http.get(`${API_PATHS.bff}/products`, async () => {
    await delay();
    return HttpResponse.json<AvailableProduct[]>(availableProducts);
  }),
  http.get(`${API_PATHS.bff}/products/:id`, async ({ params }) => {
    const product = availableProducts.find((p) => p.id === params.id);
    if (!product) {
      return new HttpResponse(null, { status: 404 });
    }
    await delay();
    return HttpResponse.json<AvailableProduct>(product);
  }),
  http.get(`${API_PATHS.cart}/profile/cart`, async () => {
    await delay();
    return HttpResponse.json<CartItem[]>(cart);
  }),
  http.put(`${API_PATHS.cart}/profile/cart`, () => {
    return new HttpResponse(null, { status: 200 });
  }),
  http.get(`${API_PATHS.order}/order`, async () => {
    await delay();
    return HttpResponse.json<Order[]>(orders);
  }),
  http.put(`${API_PATHS.order}/order`, () => {
    return new HttpResponse(null, { status: 200 });
  }),
  http.get(`${API_PATHS.order}/order/:id`, async ({ params }) => {
    const order = orders.find((p) => p.id === params.id);
    if (!order) {
      return new HttpResponse(null, { status: 404 });
    }
    await delay();
    return HttpResponse.json(order);
  }),
  http.delete(`${API_PATHS.order}/order/:id`, () => {
    return new HttpResponse(null, { status: 200 });
  }),
  http.put(`${API_PATHS.order}/order/:id/status`, () => {
    return new HttpResponse(null, { status: 200 });
  }),
];
