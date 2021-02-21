import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import ICreateOrderDTO from '@modules/orders/dtos/ICreateOrderDTO';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);
    if (!customer) {
      throw new AppError('Customer does not exist.');
    }

    const foundProducts = await this.productsRepository.findAllById(products);

    if (!foundProducts.length) {
      throw new AppError(`None product was found`);
    }

    const foundProductsIds = foundProducts.map(product => product.id);

    const notFoundProductsIds = products
      .filter(product => !foundProductsIds.includes(product.id))
      .map(product => product.id);

    if (notFoundProductsIds.length) {
      throw new AppError(
        `The following products were not found [${notFoundProductsIds.join(
          '], [',
        )}]`,
      );
    }

    const soldOutProducts = foundProducts
      .filter(product => !product.quantity)
      .map(product => product.id);

    if (soldOutProducts.length) {
      throw new AppError(
        `The following products were sold out [${soldOutProducts.join(
          '], [',
        )}]`,
      );
    }

    const notEnoughProducts = foundProducts
      .filter(foundProduct => {
        const product = products.find(p => p.id === foundProduct.id);
        if (product) {
          return foundProduct.quantity < product?.quantity;
        }
        return false;
      })
      .map(
        notEnoughProduct =>
          `[${notEnoughProduct.id}: ${notEnoughProduct.quantity}]`,
      );

    if (notEnoughProducts.length) {
      throw new AppError(
        `The following products are out of stock ${notEnoughProducts.join(
          ', ',
        )}`,
      );
    }

    const orderProducts: {
      product_id: string;
      quantity: number;
      price: number;
    }[] = [];

    const quantityUpdateProducts: {
      id: string;
      quantity: number;
    }[] = [];

    products.forEach(product => {
      orderProducts.push({
        product_id: product.id,
        quantity: product.quantity,
        price:
          foundProducts.find(foundProduct => foundProduct.id === product.id)
            ?.price || 0,
      });
      quantityUpdateProducts.push({
        id: product.id,
        quantity:
          (foundProducts.find(foundProduct => foundProduct.id === product.id)
            ?.quantity || 0) - product.quantity,
      });
    });

    const order = await this.ordersRepository.create({
      customer,
      products: orderProducts,
    });

    await this.productsRepository.updateQuantity(quantityUpdateProducts);

    return order;
  }
}

export default CreateOrderService;
